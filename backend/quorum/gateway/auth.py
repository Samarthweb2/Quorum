"""
Email/password authentication with SMTP OTP verification.
Users persist to a JSON file; sessions are in-memory bearer tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

from quorum.gateway.mailer import auth_dev_mode, send_otp_email

PBKDF2_ITERS = 120_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DEMO_EMAIL = "sam@mobbin.design"
DEMO_PASSWORD = "quorum123"
DEMO_NAME = "Sam"
OTP_TTL_SECONDS = 10 * 60
OTP_RESEND_SECONDS = 45
OTP_MAX_ATTEMPTS = 8
MailerFn = Callable[[str, str, str], Tuple[bool, Optional[str], str]]


def _hash_password(password: str, salt: bytes) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERS)
    return dk.hex()


def _hash_otp(code: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac("sha256", code.encode("utf-8"), salt, 80_000).hex()


def _public_user(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "email": record["email"],
        "name": record.get("name") or record["email"].split("@")[0],
        "created_at": record.get("created_at"),
        "verified": bool(record.get("verified", True)),
    }


class AuthStore:
    def __init__(self, path: Optional[Path] = None, mailer: Optional[MailerFn] = None) -> None:
        env = os.environ.get("QUORUM_USERS_PATH")
        self.path = Path(env) if env else (path or Path.home() / ".quorum" / "users.json")
        self._lock = threading.RLock()
        self._users: Dict[str, Dict[str, Any]] = {}
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._otps: Dict[str, Dict[str, Any]] = {}
        self._mailer: MailerFn = mailer or send_otp_email
        self._load()
        self.ensure_demo_user()

    def _load(self) -> None:
        try:
            if self.path.exists():
                data = json.loads(self.path.read_text(encoding="utf-8"))
                users = data.get("users", data) if isinstance(data, dict) else {}
                if isinstance(users, dict):
                    self._users = {k.lower(): v for k, v in users.items()}
                    for record in self._users.values():
                        if "verified" not in record:
                            record["verified"] = True
        except Exception:
            self._users = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"users": self._users}
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def ensure_demo_user(self) -> None:
        with self._lock:
            if DEMO_EMAIL.lower() in self._users:
                self._users[DEMO_EMAIL.lower()]["verified"] = True
                self._save()
                return
            salt = secrets.token_bytes(16)
            self._users[DEMO_EMAIL.lower()] = {
                "email": DEMO_EMAIL,
                "name": DEMO_NAME,
                "salt": salt.hex(),
                "password_hash": _hash_password(DEMO_PASSWORD, salt),
                "created_at": int(time.time()),
                "verified": True,
            }
            self._save()

    def _issue_session(self, record: Dict[str, Any]) -> Dict[str, Any]:
        token = secrets.token_urlsafe(32)
        user = _public_user(record)
        self._sessions[token] = {"email": record["email"].lower(), "issued_at": int(time.time())}
        return {"token": token, "user": user}

    def _otp_key(self, email: str, purpose: str) -> str:
        return f"{purpose}:{email.lower()}"

    def _issue_otp(self, email: str, purpose: str) -> Tuple[int, Dict[str, Any]]:
        now = int(time.time())
        key = self._otp_key(email, purpose)
        existing = self._otps.get(key)
        if existing and now - int(existing.get("sent_at") or 0) < OTP_RESEND_SECONDS:
            wait = OTP_RESEND_SECONDS - (now - int(existing["sent_at"]))
            return 429, {"detail": f"Please wait {wait}s before requesting another code."}

        code = f"{secrets.randbelow(1_000_000):06d}"
        salt = secrets.token_bytes(16)
        self._otps[key] = {
            "salt": salt.hex(),
            "code_hash": _hash_otp(code, salt),
            "expires_at": now + OTP_TTL_SECONDS,
            "attempts": 0,
            "sent_at": now,
            "purpose": purpose,
            "email": email.lower(),
        }
        ok, err, delivery = self._mailer(email, code, purpose)
        if not ok:
            self._otps.pop(key, None)
            return 503, {"detail": err or "Could not send verification email."}

        payload: Dict[str, Any] = {
            "needs_verification": True,
            "email": email.lower(),
            "delivery": delivery,
            "message": (
                f"We sent a 6-digit code to {email}."
                if delivery == "smtp"
                else f"SMTP is not configured locally. Use the on-screen code for {email}."
            ),
        }
        if delivery != "smtp" and auth_dev_mode():
            payload["dev_otp"] = code
        return 200, payload

    def _check_otp(self, email: str, purpose: str, code: str) -> Tuple[int, Optional[str]]:
        key = self._otp_key(email, purpose)
        record = self._otps.get(key)
        if not record:
            return 400, "No verification code found. Request a new one."
        if int(time.time()) > int(record["expires_at"]):
            self._otps.pop(key, None)
            return 400, "That code has expired. Request a new one."
        record["attempts"] = int(record.get("attempts") or 0) + 1
        if record["attempts"] > OTP_MAX_ATTEMPTS:
            self._otps.pop(key, None)
            return 429, "Too many incorrect attempts. Request a new code."
        salt = bytes.fromhex(record["salt"])
        actual = _hash_otp((code or "").strip(), salt)
        if not hmac.compare_digest(record["code_hash"], actual):
            return 401, "Incorrect verification code."
        self._otps.pop(key, None)
        return 200, None

    def signup(self, email: str, password: str, name: str = "") -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        name = (name or "").strip()
        if not EMAIL_RE.match(email):
            return 400, {"detail": "Enter a valid email address."}
        if len(password or "") < 8:
            return 400, {"detail": "Password must be at least 8 characters."}
        with self._lock:
            existing = self._users.get(email)
            if existing and existing.get("verified", True):
                return 409, {"detail": "An account with this email already exists. Sign in instead."}
            salt = secrets.token_bytes(16)
            self._users[email] = {
                "email": email,
                "name": name or email.split("@")[0],
                "salt": salt.hex(),
                "password_hash": _hash_password(password, salt),
                "created_at": int((existing or {}).get("created_at") or time.time()),
                "verified": False,
            }
            self._save()
            code, payload = self._issue_otp(email, "signup")
            if code >= 400:
                return code, payload
            payload["status"] = "otp_sent"
            return 200, payload

    def _consume_otp(self, email: str, code: str, purposes: Tuple[str, ...]) -> Tuple[int, Optional[str]]:
        last_status, last_err = 400, "No verification code found. Request a new one."
        found = False
        for purpose in purposes:
            if self._otp_key(email, purpose) not in self._otps:
                continue
            found = True
            status, err = self._check_otp(email, purpose, code)
            if status == 200:
                return status, err
            last_status, last_err = status, err
        if not found:
            return 400, "No verification code found. Request a new one."
        return last_status, last_err

    def verify_email(self, email: str, code: str) -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        with self._lock:
            record = self._users.get(email)
            if not record:
                return 404, {"detail": "No account found for this email."}
            status, err = self._consume_otp(email, code, ("signup", "signin"))
            if status != 200:
                return status, {"detail": err}
            record["verified"] = True
            self._save()
            session = self._issue_session(record)
            session["message"] = "Email verified. You are signed in."
            return 200, session

    def resend_otp(self, email: str, purpose: str = "signup") -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        if not EMAIL_RE.match(email):
            return 400, {"detail": "Enter a valid email address."}
        if purpose not in ("signup", "signin", "reset"):
            purpose = "signup"
        with self._lock:
            record = self._users.get(email)
            if purpose == "reset":
                if not record:
                    # Do not leak whether the account exists.
                    return 200, {
                        "ok": True,
                        "message": "If that email is registered, a reset code is on its way.",
                    }
                return self._issue_otp(email, "reset")
            if not record:
                return 404, {"detail": "No account found for this email. Create one to continue."}
            if record.get("verified") and purpose != "reset":
                return 400, {"detail": "This account is already verified. Sign in with your password."}
            return self._issue_otp(email, purpose)

    def signin(self, email: str, password: str) -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        if not EMAIL_RE.match(email):
            return 400, {"detail": "Enter a valid email address."}
        with self._lock:
            record = self._users.get(email)
            if not record:
                return 401, {"detail": "No account found for this email. Create one to continue."}
            salt = bytes.fromhex(record["salt"])
            expected = record["password_hash"]
            actual = _hash_password(password or "", salt)
            if not hmac.compare_digest(expected, actual):
                return 401, {"detail": "Incorrect password."}
            if not record.get("verified", True):
                otp_code, otp_payload = self._issue_otp(email, "signin")
                if otp_code >= 400:
                    return otp_code, otp_payload
                otp_payload["detail"] = "Verify your email with the code we just sent before signing in."
                return 403, otp_payload
            return 200, self._issue_session(record)

    def forgot_password(self, email: str) -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        if not EMAIL_RE.match(email):
            return 400, {"detail": "Enter a valid email address."}
        with self._lock:
            record = self._users.get(email)
            if not record:
                return 200, {
                    "ok": True,
                    "message": "If that email is registered, a reset code is on its way.",
                }
            return self._issue_otp(email, "reset")

    def reset_password(self, email: str, code: str, password: str) -> Tuple[int, Dict[str, Any]]:
        email = (email or "").strip().lower()
        if len(password or "") < 8:
            return 400, {"detail": "Password must be at least 8 characters."}
        with self._lock:
            record = self._users.get(email)
            if not record:
                return 404, {"detail": "No account found for this email."}
            status, err = self._check_otp(email, "reset", code)
            if status != 200:
                return status, {"detail": err}
            salt = secrets.token_bytes(16)
            record["salt"] = salt.hex()
            record["password_hash"] = _hash_password(password, salt)
            record["verified"] = True
            self._save()
            session = self._issue_session(record)
            session["message"] = "Password updated. You are signed in."
            return 200, session

    def me(self, token: Optional[str]) -> Tuple[int, Dict[str, Any]]:
        if not token:
            return 401, {"detail": "Not signed in."}
        with self._lock:
            session = self._sessions.get(token)
            if not session:
                return 401, {"detail": "Session expired. Please sign in again."}
            record = self._users.get(session["email"])
            if not record:
                return 401, {"detail": "Account no longer exists."}
            return 200, {"user": _public_user(record)}

    def signout(self, token: Optional[str]) -> Dict[str, Any]:
        if token:
            with self._lock:
                self._sessions.pop(token, None)
        return {"ok": True}


def bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip() or None

"""SMTP delivery for authentication emails (OTP verification and password reset)."""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger("quorum.gateway.mailer")

PURPOSE_COPY = {
    "signup": {
        "subject": "Your Quorum verification code",
        "headline": "Confirm your email",
        "body": "Use this code to finish creating your Quorum account. It expires in 10 minutes.",
    },
    "signin": {
        "subject": "Your Quorum sign-in verification code",
        "headline": "Verify this sign-in",
        "body": "Your account is not verified yet. Enter this code to activate it. It expires in 10 minutes.",
    },
    "reset": {
        "subject": "Reset your Quorum password",
        "headline": "Password reset",
        "body": "Use this code to choose a new password. It expires in 10 minutes.",
    },
}


def load_dotenv(path: Optional[Path] = None) -> None:
    """Load KEY=VALUE pairs from .env without overriding existing process env."""
    candidates = []
    if path:
        candidates.append(path)
    here = Path(__file__).resolve()
    candidates.append(Path.cwd() / ".env")
    try:
        candidates.append(here.parents[2] / ".env")  # backend/.env
    except IndexError:
        pass
    try:
        candidates.append(here.parents[3] / ".env")  # repo root .env
    except IndexError:
        pass
    seen = set()
    for candidate in candidates:
        resolved = candidate.resolve() if candidate.exists() else candidate
        if resolved in seen or not candidate.exists() or not candidate.is_file():
            continue
        seen.add(resolved)
        try:
            for raw in candidate.read_text(encoding="utf-8-sig").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                if line.lower().startswith("export "):
                    line = line[7:].strip()
                key, _, value = line.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
        except OSError:
            continue


load_dotenv()


def _parse_smtp_port(raw: Optional[str]) -> int:
    try:
        port = int((raw or "587").strip() or "587")
    except ValueError:
        return 587
    if port < 1 or port > 65535:
        return 587
    return port


@dataclass
class SmtpConfig:
    host: str
    port: int
    username: str
    password: str
    sender: str
    starttls: bool
    use_ssl: bool

    @property
    def enabled(self) -> bool:
        return bool(self.host and self.username and self.password)

    def missing_env_vars(self) -> list[str]:
        missing: list[str] = []
        if not self.host:
            missing.append("SMTP_HOST")
        if not self.username:
            missing.append("SMTP_USER")
        if not self.password:
            missing.append("SMTP_PASSWORD")
        return missing

    @classmethod
    def from_env(cls) -> "SmtpConfig":
        host = (os.environ.get("SMTP_HOST") or "").strip()
        port = _parse_smtp_port(os.environ.get("SMTP_PORT"))
        username = (os.environ.get("SMTP_USER") or os.environ.get("SMTP_USERNAME") or "").strip()
        password = "".join((os.environ.get("SMTP_PASSWORD") or os.environ.get("SMTP_PASS") or "").split())
        sender = (os.environ.get("SMTP_FROM") or os.environ.get("SMTP_SENDER") or username).strip()
        use_ssl = (os.environ.get("SMTP_SSL") or "").strip().lower() in ("1", "true", "yes") or port == 465
        starttls_raw = (os.environ.get("SMTP_STARTTLS") or "").strip().lower()
        if starttls_raw:
            starttls = starttls_raw in ("1", "true", "yes")
        else:
            # Submission port 587 expects STARTTLS; implicit TLS (465) does not.
            starttls = not use_ssl
        return cls(
            host=host,
            port=port,
            username=username,
            password=password,
            sender=sender or username,
            starttls=starttls and not use_ssl,
            use_ssl=use_ssl,
        )


def smtp_required() -> bool:
    """Production hosts must send real mail; local/dev can fall back to console OTP."""
    flag = (os.environ.get("QUORUM_REQUIRE_SMTP") or "").strip().lower()
    if flag in ("1", "true", "yes"):
        return True
    if flag in ("0", "false", "no"):
        return False
    return bool(os.environ.get("RENDER") or os.environ.get("QUORUM_PRODUCTION"))


def auth_dev_mode() -> bool:
    flag = (os.environ.get("QUORUM_AUTH_DEV") or "").strip().lower()
    if flag in ("1", "true", "yes"):
        return True
    if flag in ("0", "false", "no"):
        return False
    return not smtp_required()


def _html_email(code: str, purpose: str) -> str:
    copy = PURPOSE_COPY.get(purpose, PURPOSE_COPY["signup"])
    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0b0b0c;font-family:Inter,Segoe UI,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#161617;border:1px solid #2a2a2c;border-radius:16px;padding:32px;">
            <tr><td style="color:#f5f5f5;font-size:13px;letter-spacing:.12em;text-transform:uppercase;">Quorum</td></tr>
            <tr><td style="padding-top:16px;color:#ffffff;font-size:24px;font-weight:500;">{copy["headline"]}</td></tr>
            <tr><td style="padding-top:8px;color:#a3a3a3;font-size:14px;line-height:1.6;">{copy["body"]}</td></tr>
            <tr>
              <td align="center" style="padding:28px 0;">
                <div style="display:inline-block;letter-spacing:.35em;font-size:32px;font-weight:600;color:#ffffff;background:#111;border:1px solid #333;border-radius:12px;padding:14px 22px;">
                  {code}
                </div>
              </td>
            </tr>
            <tr><td style="color:#737373;font-size:12px;line-height:1.5;">If you did not request this, you can ignore the email. Never share this code.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_otp_email(to_email: str, code: str, purpose: str = "signup") -> Tuple[bool, Optional[str], str]:
    """
    Send a 6-digit OTP.
    Returns (ok, error_message, delivery) where delivery is 'smtp' or 'console'.
    """
    cfg = SmtpConfig.from_env()
    copy = PURPOSE_COPY.get(purpose, PURPOSE_COPY["signup"])
    if not cfg.enabled:
        logger.warning("SMTP is not configured. OTP for %s (%s) is %s", to_email, purpose, code)
        if smtp_required():
            names = ", ".join(cfg.missing_env_vars()) or "SMTP_HOST, SMTP_USER, SMTP_PASSWORD"
            return (
                False,
                (
                    "Email delivery is not configured on this server. "
                    f"Missing environment variables: {names}. "
                    "Set them in a local .env file or in Render Environment Variables."
                ),
                "none",
            )
        return True, None, "console"

    msg = EmailMessage()
    msg["Subject"] = copy["subject"]
    msg["From"] = cfg.sender
    msg["To"] = to_email
    msg.set_content(
        f"{copy['headline']}\n\n{copy['body']}\n\nYour code: {code}\n\nIf you did not request this, ignore this email."
    )
    msg.add_alternative(_html_email(code, purpose), subtype="html")

    try:
        if cfg.use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=20, context=context) as smtp:
                smtp.login(cfg.username, cfg.password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(cfg.host, cfg.port, timeout=20) as smtp:
                smtp.ehlo()
                if cfg.starttls:
                    smtp.starttls(context=ssl.create_default_context())
                    smtp.ehlo()
                smtp.login(cfg.username, cfg.password)
                smtp.send_message(msg)
        logger.info("Sent %s OTP to %s via SMTP", purpose, to_email)
        return True, None, "smtp"
    except Exception as exc:
        logger.exception("Failed to send OTP email to %s", to_email)
        return False, f"Could not send email: {exc}", "none"

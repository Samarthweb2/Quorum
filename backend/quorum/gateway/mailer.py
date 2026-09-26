"""Email delivery for authentication OTPs (verification and password reset).

Supports three backends, tried in this order:
1. SendGrid Web API (SENDGRID_API_KEY set) — HTTPS/443, never blocked by firewalls.
2. Raw SMTP (SMTP_HOST/SMTP_USER/SMTP_PASSWORD set) — direct TCP to mail server.
3. Console/dev fallback — OTP printed to logs, returned in the API response.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Optional, Tuple

import httpx

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


@dataclass
class SendGridConfig:
    api_key: str
    sender: str

    @property
    def enabled(self) -> bool:
        return bool(self.api_key and self.sender)

    def missing_env_vars(self) -> list[str]:
        missing: list[str] = []
        if not self.api_key:
            missing.append("SENDGRID_API_KEY")
        if not self.sender:
            missing.append("SENDGRID_FROM")
        return missing

    @classmethod
    def from_env(cls) -> "SendGridConfig":
        api_key = (os.environ.get("SENDGRID_API_KEY") or "").strip()
        sender = (
            os.environ.get("SENDGRID_FROM")
            or os.environ.get("SMTP_FROM")
            or os.environ.get("SMTP_SENDER")
            or os.environ.get("SMTP_USER")
            or ""
        ).strip()
        return cls(api_key=api_key, sender=sender)


def _plain_text_body(code: str, purpose: str) -> str:
    copy = PURPOSE_COPY.get(purpose, PURPOSE_COPY["signup"])
    return (
        f"{copy['headline']}\n\n{copy['body']}\n\n"
        f"Your code: {code}\n\n"
        "If you did not request this, ignore this email."
    )


def _delivery_configured() -> Tuple[bool, Optional[str]]:
    """Returns (is_configured, error_message_when_not).

    On RENDER/production, either SendGrid or SMTP must be fully configured.
    """
    sg = SendGridConfig.from_env()
    smtp = SmtpConfig.from_env()
    if sg.enabled or smtp.enabled:
        return True, None
    required = smtp_required()
    if not required:
        return True, None
    missing_parts: list[str] = []
    sg_missing = sg.missing_env_vars()
    if sg_missing:
        missing_parts.append(f"SendGrid (needs {', '.join(sg_missing)})")
    smtp_missing = smtp.missing_env_vars()
    if smtp_missing:
        missing_parts.append(f"SMTP (needs {', '.join(smtp_missing)})")
    msg = (
        "Email delivery is not configured on this server. "
        "Configure either " + " or ".join(missing_parts) + ". "
        "Set them in a local .env file or in Render Environment Variables."
    )
    return False, msg


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


def _send_via_sendgrid(to_email: str, code: str, purpose: str, cfg: SendGridConfig) -> Tuple[bool, Optional[str]]:
    copy = PURPOSE_COPY.get(purpose, PURPOSE_COPY["signup"])
    payload = {
        "personalizations": [
            {
                "to": [{"email": to_email}],
                "subject": copy["subject"],
            }
        ],
        "from": {"email": cfg.sender},
        "content": [
            {"type": "text/plain", "value": _plain_text_body(code, purpose)},
            {"type": "text/html", "value": _html_email(code, purpose)},
        ],
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if r.status_code < 300:
                return True, None
            detail = r.text
            try:
                data = r.json()
                if isinstance(data, dict) and "errors" in data:
                    first_err = data["errors"][0] if data["errors"] else {}
                    detail = first_err.get("message") or first_err.get("field") or detail
            except Exception:
                pass
            return False, f"SendGrid API error ({r.status_code}): {detail}"
    except httpx.HTTPError as exc:
        logger.exception("SendGrid HTTP transport error sending to %s", to_email)
        return False, f"SendGrid transport error: {exc}"
    except Exception as exc:
        logger.exception("Unexpected SendGrid error sending to %s", to_email)
        return False, f"Could not send email via SendGrid: {exc}"


def _send_via_smtp(to_email: str, code: str, purpose: str, cfg: SmtpConfig) -> Tuple[bool, Optional[str]]:
    copy = PURPOSE_COPY.get(purpose, PURPOSE_COPY["signup"])
    msg = EmailMessage()
    msg["Subject"] = copy["subject"]
    msg["From"] = cfg.sender
    msg["To"] = to_email
    msg.set_content(_plain_text_body(code, purpose))
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
        return True, None
    except Exception as exc:
        logger.exception("SMTP error sending OTP email to %s", to_email)
        return False, f"Could not send email via SMTP: {exc}"


def _selected_backend() -> str:
    """Return 'sendgrid' | 'smtp' | 'auto'.

    When QUORUM_EMAIL_BACKEND is set, force that backend. Otherwise prefer
    'sendgrid' if configured, else 'smtp' if configured, else 'auto'.
    On RENDER=true we also refuse SMTP fallback by default — cloud providers
    often block ports 587/465 for anti-spam.
    """
    force = (os.environ.get("QUORUM_EMAIL_BACKEND") or "").strip().lower()
    if force in ("sendgrid", "smtp"):
        return force
    if SendGridConfig.from_env().enabled:
        return "sendgrid"
    if SmtpConfig.from_env().enabled:
        return "smtp"
    return "auto"


def _allow_smtp_fallback() -> bool:
    """By default, SMTP fallback is disabled on cloud hosts where 587/465 are blocked."""
    flag = (os.environ.get("QUORUM_ALLOW_SMTP_FALLBACK") or "").strip().lower()
    if flag in ("1", "true", "yes"):
        return True
    if flag in ("0", "false", "no"):
        return False
    return not (os.environ.get("RENDER") or os.environ.get("QUORUM_PRODUCTION") or os.environ.get("HEROKU"))


def send_otp_email(to_email: str, code: str, purpose: str = "signup") -> Tuple[bool, Optional[str], str]:
    """
    Send a 6-digit OTP.

    Default backend priority (configurable via QUORUM_EMAIL_BACKEND):
      1. SendGrid HTTP API (SENDGRID_API_KEY set) — port 443, never blocked.
      2. Raw SMTP (SMTP_HOST/SMTP_USER/SMTP_PASSWORD set).
      3. Console/dev fallback — only allowed when !smtp_required().

    On RENDER=true, SMTP fallback is DISABLED by default because cloud providers
    almost always block outbound ports 587/465 for anti-spam, which would
    otherwise mask the real SendGrid error behind a generic "network unreachable".
    Set QUORUM_ALLOW_SMTP_FALLBACK=true to re-enable it explicitly.

    Returns (ok, error_message, delivery) where delivery is 'sendgrid' | 'smtp' | 'console' | 'none'.
    """
    configured, config_err = _delivery_configured()
    if not configured:
        logger.warning("No email delivery configured. OTP for %s (%s) is %s", to_email, purpose, code)
        return False, config_err, "none"

    backend = _selected_backend()
    sg = SendGridConfig.from_env()
    smtp_cfg = SmtpConfig.from_env()
    allow_smtp_fb = _allow_smtp_fallback()

    if backend == "sendgrid" and sg.enabled:
        ok, err = _send_via_sendgrid(to_email, code, purpose, sg)
        if ok:
            logger.info("Sent %s OTP to %s via SendGrid", purpose, to_email)
            return True, None, "sendgrid"
        if smtp_cfg.enabled and allow_smtp_fb:
            logger.warning("SendGrid failed, falling back to SMTP: %s", err)
            ok2, err2 = _send_via_smtp(to_email, code, purpose, smtp_cfg)
            if ok2:
                logger.info("Sent %s OTP to %s via SMTP fallback", purpose, to_email)
                return True, None, "smtp"
            return False, f"SendGrid failed: {err} — SMTP fallback also failed: {err2}", "none"
        return False, f"SendGrid failed: {err}", "none"

    if backend == "smtp" and smtp_cfg.enabled:
        ok, err = _send_via_smtp(to_email, code, purpose, smtp_cfg)
        if ok:
            logger.info("Sent %s OTP to %s via SMTP", purpose, to_email)
            return True, None, "smtp"
        return False, err, "none"

    if sg.enabled:
        ok, err = _send_via_sendgrid(to_email, code, purpose, sg)
        if ok:
            logger.info("Sent %s OTP to %s via SendGrid", purpose, to_email)
            return True, None, "sendgrid"
        if smtp_cfg.enabled and allow_smtp_fb:
            logger.warning("SendGrid failed, falling back to SMTP: %s", err)
            ok2, err2 = _send_via_smtp(to_email, code, purpose, smtp_cfg)
            if ok2:
                logger.info("Sent %s OTP to %s via SMTP fallback", purpose, to_email)
                return True, None, "smtp"
            return False, f"SendGrid failed: {err} — SMTP fallback also failed: {err2}", "none"
        return False, f"SendGrid failed: {err}", "none"

    if smtp_cfg.enabled:
        ok, err = _send_via_smtp(to_email, code, purpose, smtp_cfg)
        if ok:
            logger.info("Sent %s OTP to %s via SMTP", purpose, to_email)
            return True, None, "smtp"
        return False, err, "none"

    logger.warning("No email backend configured. OTP for %s (%s) is %s", to_email, purpose, code)
    if smtp_required():
        missing_parts: list[str] = []
        sg_missing = sg.missing_env_vars()
        if sg_missing:
            missing_parts.append(f"SendGrid (needs {', '.join(sg_missing)})")
        smtp_missing = smtp_cfg.missing_env_vars()
        if smtp_missing:
            missing_parts.append(f"SMTP (needs {', '.join(smtp_missing)})")
        msg = (
            "Email delivery is not configured on this server. "
            "Configure either " + " or ".join(missing_parts) + ". "
            "Set them in a local .env file or in Render Environment Variables."
        )
        return False, msg, "none"
    return True, None, "console"

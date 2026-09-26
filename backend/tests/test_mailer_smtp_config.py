"""SMTP environment configuration for OTP delivery."""

from unittest.mock import MagicMock, patch

from quorum.gateway.mailer import SmtpConfig, send_otp_email


def _clear_smtp_env(monkeypatch):
    for key in (
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_USERNAME",
        "SMTP_PASSWORD",
        "SMTP_PASS",
        "SMTP_FROM",
        "SMTP_SENDER",
        "SMTP_STARTTLS",
        "SMTP_SSL",
        "QUORUM_REQUIRE_SMTP",
        "QUORUM_PRODUCTION",
        "QUORUM_AUTH_DEV",
        "RENDER",
    ):
        monkeypatch.delenv(key, raising=False)


def test_missing_vars_named_when_smtp_required(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("RENDER", "true")
    cfg = SmtpConfig.from_env()
    assert cfg.enabled is False
    assert cfg.missing_env_vars() == ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]
    assert cfg.port == 587
    assert cfg.starttls is True
    assert cfg.use_ssl is False

    ok, err, delivery = send_otp_email("probe@example.com", "123456", "signup")
    assert ok is False
    assert delivery == "none"
    assert "Missing environment variables: SMTP_HOST, SMTP_USER, SMTP_PASSWORD" in (err or "")
    assert "SMTP_PASSWORD=" not in (err or "")


def test_partial_smtp_config_lists_only_missing(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("QUORUM_REQUIRE_SMTP", "1")
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    ok, err, delivery = send_otp_email("probe@example.com", "123456", "signup")
    assert ok is False
    assert delivery == "none"
    assert "SMTP_USER" in (err or "")
    assert "SMTP_PASSWORD" in (err or "")
    assert "SMTP_HOST" not in (err or "").split("Missing environment variables: ", 1)[-1]


def test_local_fallback_when_smtp_not_required(monkeypatch):
    _clear_smtp_env(monkeypatch)
    ok, err, delivery = send_otp_email("probe@example.com", "123456", "signup")
    assert ok is True
    assert err is None
    assert delivery == "console"


def test_port_465_uses_ssl_not_starttls(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "465")
    monkeypatch.setenv("SMTP_USER", "user@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    cfg = SmtpConfig.from_env()
    assert cfg.port == 465
    assert cfg.use_ssl is True
    assert cfg.starttls is False


def test_invalid_port_defaults_to_587(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("SMTP_PORT", "not-a-port")
    cfg = SmtpConfig.from_env()
    assert cfg.port == 587
    assert cfg.starttls is True


def test_send_uses_starttls_on_587(monkeypatch):
    _clear_smtp_env(monkeypatch)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "user@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")

    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    smtp.__exit__.return_value = False

    with patch("quorum.gateway.mailer.smtplib.SMTP", return_value=smtp) as ctor:
        ok, err, delivery = send_otp_email("probe@example.com", "123456", "signup")

    assert ok is True
    assert err is None
    assert delivery == "smtp"
    ctor.assert_called_once()
    assert ctor.call_args.args[0] == "smtp.example.com"
    assert ctor.call_args.args[1] == 587
    smtp.starttls.assert_called_once()
    smtp.login.assert_called_once_with("user@example.com", "secret")
    smtp.send_message.assert_called_once()

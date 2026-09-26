"""Auth signup/signin with SMTP OTP and AI chat assistant tests."""

import pytest
from httpx import ASGITransport, AsyncClient

from quorum.gateway import app as app_module
from quorum.gateway.auth import AuthStore
from quorum.gateway.cluster_controller import ClusterController
from quorum.ai.coordinator import AgentSwarmCoordinator


@pytest.fixture
async def client(tmp_path, monkeypatch):
    users_file = tmp_path / "users.json"
    monkeypatch.setenv("QUORUM_USERS_PATH", str(users_file))
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.setenv("QUORUM_AUTH_DEV", "1")

    sent = {}

    def fake_mailer(email, code, purpose):
        sent["email"] = email
        sent["code"] = code
        sent["purpose"] = purpose
        return True, None, "smtp"

    app_module.auth_store = AuthStore(path=users_file, mailer=fake_mailer)
    app_module.auth_store._sent = sent

    if app_module.controller is None:
        app_module.controller = ClusterController(
            node_ids=["node-1", "node-2", "node-3", "node-4", "node-5"],
            on_broadcast_event=app_module.broadcast_to_websockets,
        )
        await app_module.controller.initialize_cluster()
    if app_module.ai_coordinator is None:
        app_module.ai_coordinator = AgentSwarmCoordinator(
            cluster_controller=app_module.controller,
            on_event_broadcast=app_module.broadcast_to_websockets,
        )

    async with AsyncClient(transport=ASGITransport(app=app_module.app), base_url="http://test") as ac:
        yield ac, sent


@pytest.mark.asyncio
async def test_signup_requires_otp_then_signin(client):
    ac, sent = client
    signup = await ac.post("/api/auth/signup", json={
        "email": "ada@quorum.dev",
        "password": "secret123",
        "name": "Ada",
    })
    assert signup.status_code == 200
    body = signup.json()
    assert body["needs_verification"] is True
    assert "token" not in body
    assert sent["code"]
    assert sent["email"] == "ada@quorum.dev"

    dup = await ac.post("/api/auth/signup", json={
        "email": "ada@quorum.dev",
        "password": "secret123",
        "name": "Ada",
    })
    # Unverified accounts can request a new code (rate-limited) or succeed if wait elapsed.
    assert dup.status_code in (200, 429)

    blocked = await ac.post("/api/auth/signin", json={
        "email": "ada@quorum.dev",
        "password": "secret123",
    })
    assert blocked.status_code in (403, 429)
    if blocked.status_code == 403:
        assert blocked.json()["needs_verification"] is True

    verify = await ac.post("/api/auth/verify", json={
        "email": "ada@quorum.dev",
        "code": sent["code"],
    })
    assert verify.status_code == 200
    token = verify.json()["token"]
    assert verify.json()["user"]["name"] == "Ada"
    assert verify.json()["user"]["verified"] is True

    me = await ac.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"]["email"] == "ada@quorum.dev"

    signin = await ac.post("/api/auth/signin", json={
        "email": "ada@quorum.dev",
        "password": "secret123",
    })
    assert signin.status_code == 200
    assert signin.json()["token"]


@pytest.mark.asyncio
async def test_wrong_otp_and_password_reset(client):
    ac, sent = client
    await ac.post("/api/auth/signup", json={
        "email": "reset@quorum.dev",
        "password": "secret123",
        "name": "Reset",
    })
    bad = await ac.post("/api/auth/verify", json={"email": "reset@quorum.dev", "code": "000000"})
    assert bad.status_code == 401

    good = await ac.post("/api/auth/verify", json={"email": "reset@quorum.dev", "code": sent["code"]})
    assert good.status_code == 200

    forgot = await ac.post("/api/auth/forgot-password", json={"email": "reset@quorum.dev"})
    assert forgot.status_code == 200
    reset_code = sent["code"]
    reset = await ac.post("/api/auth/reset-password", json={
        "email": "reset@quorum.dev",
        "code": reset_code,
        "password": "newpass123",
    })
    assert reset.status_code == 200
    old = await ac.post("/api/auth/signin", json={
        "email": "reset@quorum.dev",
        "password": "secret123",
    })
    assert old.status_code == 401
    fresh = await ac.post("/api/auth/signin", json={
        "email": "reset@quorum.dev",
        "password": "newpass123",
    })
    assert fresh.status_code == 200


@pytest.mark.asyncio
async def test_demo_signin(client):
    ac, _sent = client
    res = await ac.post("/api/auth/signin", json={
        "email": "sam@mobbin.design",
        "password": "quorum123",
    })
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "sam@mobbin.design"


@pytest.mark.asyncio
async def test_ai_chat_always_replies(client):
    ac, _sent = client
    leader = await ac.post("/api/ai/chat", json={"message": "Who is the leader?"})
    assert leader.status_code == 200
    data = leader.json()
    assert data["success"] is True
    assert data["reply"]
    assert "leader" in data["reply"].lower() or data["leader_id"]

    other = await ac.post("/api/ai/chat", json={"message": "What is the meaning of fencing tokens in this cluster?"})
    assert other.status_code == 200
    assert other.json()["reply"]

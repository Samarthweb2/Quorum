"""
FastAPI & WebSocket Gateway for Quorum Real-Time Visualizer.
Exposes REST management APIs, chaos injection controls, and WebSocket streaming.
"""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from quorum.gateway.cluster_controller import ClusterController
from quorum.ai.coordinator import AgentSwarmCoordinator

logger = logging.getLogger("quorum.gateway.app")

# Global cluster controller and AI coordinator instances
controller: Optional[ClusterController] = None
ai_coordinator: Optional[AgentSwarmCoordinator] = None
connected_websockets: Set[WebSocket] = set()


def broadcast_to_websockets(event: Dict[str, Any]) -> None:
    """Dispatches event to all connected browser WebSocket clients."""
    if not connected_websockets:
        return

    payload = json.dumps(event)
    loop = asyncio.get_event_loop()
    if loop.is_running():
        for ws in list(connected_websockets):
            asyncio.create_task(_safe_send(ws, payload))


async def _safe_send(ws: WebSocket, payload: str) -> None:
    try:
        await ws.send_text(payload)
    except Exception:
        connected_websockets.discard(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global controller, ai_coordinator
    logger.info("Starting Quorum Visualizer Gateway...")
    controller = ClusterController(
        node_ids=["node-1", "node-2", "node-3", "node-4", "node-5"],
        on_broadcast_event=broadcast_to_websockets,
    )
    await controller.initialize_cluster()
    ai_coordinator = AgentSwarmCoordinator(
        cluster_controller=controller,
        on_event_broadcast=broadcast_to_websockets,
    )
    yield
    logger.info("Shutting down Quorum Visualizer Gateway...")
    if controller:
        await controller.shutdown()



app = FastAPI(
    title="Quorum Visualizer Control Plane",
    description="Real-time consensus visualizer and distributed lock manager API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request schemas
class AcquireLockReq(BaseModel):
    key: str = Field(default="primary-db-writer")
    client_id: str = Field(default="worker-alpha")
    ttl_ms: int = Field(default=5000)


class RenewLockReq(BaseModel):
    key: str
    client_id: str
    fence_token: int
    ttl_ms: int = Field(default=5000)


class ReleaseLockReq(BaseModel):
    key: str
    client_id: str
    fence_token: int


class AcquireLeaseReq(BaseModel):
    key: str = Field(default="primary-db-writer")
    owner_id: Optional[str] = None
    client_id: Optional[str] = None
    ttl_ms: int = Field(default=5000)


class RenewLeaseReq(BaseModel):
    owner_id: Optional[str] = None
    client_id: Optional[str] = None
    fence_token: Optional[int] = None
    fencing_token: Optional[int] = None
    ttl_ms: int = Field(default=5000)


class ReleaseLeaseReq(BaseModel):
    owner_id: Optional[str] = None
    client_id: Optional[str] = None
    fence_token: Optional[int] = None
    fencing_token: Optional[int] = None


class CompactWalReq(BaseModel):
    node_id: Optional[str] = None


class PartitionReq(BaseModel):
    partitions: List[List[str]] = Field(
        default=[["node-1", "node-2", "node-3"], ["node-4", "node-5"]],
        description="List of node lists representing disjoint network partitions",
    )


class NodeActionReq(BaseModel):
    node_id: str


class SnapshotReq(BaseModel):
    node_id: Optional[str] = None


class NetworkConditionReq(BaseModel):
    latency_ms: float = Field(default=0.0, ge=0.0, le=2000.0)
    packet_loss_rate: float = Field(default=0.0, ge=0.0, le=1.0)


class ZombieSimReq(BaseModel):
    resource_name: str = Field(default="production-orders-db")


# =============================================================================
# REST Endpoints
# =============================================================================

@app.get("/api/nodes")
async def get_nodes():
    """Returns list of all nodes with id, role, current_term, commit_index, last_heartbeat_at, log_length."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.get_nodes_summary()


@app.get("/api/leases")
async def get_leases():
    """Returns active leases with key, owner_id, fencing_token, acquired_at, expires_at, remaining_ttl_ms."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.get_leases_summary()


@app.post("/api/leases/acquire")
async def acquire_lease(req: AcquireLeaseReq):
    """Acquires a distributed lease with monotonic fencing token."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    client_id = req.owner_id or req.client_id or "worker-alpha"
    result = await controller.acquire_lock(req.key, client_id, req.ttl_ms)
    return result


@app.post("/api/leases/{key}/renew")
async def renew_lease(key: str, req: RenewLeaseReq):
    """Renews a lease TTL using client_id and fencing_token."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    client_id = req.owner_id or req.client_id or "worker-alpha"
    token = req.fence_token if req.fence_token is not None else (req.fencing_token or 0)
    result = await controller.renew_lock(key, client_id, token, req.ttl_ms)
    return result


@app.post("/api/leases/{key}/release")
async def release_lease(key: str, req: ReleaseLeaseReq):
    """Releases an active lease."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    client_id = req.owner_id or req.client_id or "worker-alpha"
    token = req.fence_token if req.fence_token is not None else (req.fencing_token or 0)
    result = await controller.release_lock(key, client_id, token)
    return result


@app.get("/api/leases/{key}/history")
async def get_lease_history(key: str):
    """Returns ordered event history for a given lease key."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.get_lease_history(key)


@app.post("/api/admin/compact-wal")
async def compact_wal(req: Optional[CompactWalReq] = None):
    """Triggers Raft snapshot and real WAL prefix compaction."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    target_id = req.node_id if req and req.node_id else None
    return await controller.take_snapshot(target_id)


@app.post("/api/admin/simulate/zombie")
async def simulate_zombie(req: Optional[ZombieSimReq] = None):
    """Test harness simulation: demonstrates GC pause, lock expiry, and downstream storage fencing rejection."""
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    resource = req.resource_name if req else "production-orders-db"
    res = await controller.simulate_zombie_worker(resource)
    res["is_simulation"] = True
    return res


@app.get("/api/cluster/status")
async def get_cluster_status():
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.get_cluster_status()


@app.get("/api/logs")
async def get_cluster_logs():
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.get_node_logs()


@app.post("/api/locks/acquire")
async def acquire_lock(req: AcquireLockReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    result = await controller.acquire_lock(req.key, req.client_id, req.ttl_ms)
    return result


@app.post("/api/locks/renew")
async def renew_lock(req: RenewLockReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    result = await controller.renew_lock(req.key, req.client_id, req.fence_token, req.ttl_ms)
    return result


@app.post("/api/locks/release")
async def release_lock(req: ReleaseLockReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    result = await controller.release_lock(req.key, req.client_id, req.fence_token)
    return result


@app.post("/api/chaos/partition")
async def create_partition(req: PartitionReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.create_partition(req.partitions)


@app.post("/api/chaos/heal")
async def heal_partitions():
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.heal_partitions()


@app.post("/api/chaos/kill")
async def kill_node(req: NodeActionReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return await controller.kill_node(req.node_id)


@app.post("/api/chaos/restart")
async def restart_node(req: NodeActionReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return await controller.restart_node(req.node_id)


@app.post("/api/chaos/network-conditions")
async def set_network_conditions(req: NetworkConditionReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return controller.set_network_conditions(req.latency_ms, req.packet_loss_rate)


@app.post("/api/chaos/simulate-zombie")
async def simulate_zombie_worker(req: ZombieSimReq):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    return await controller.simulate_zombie_worker(req.resource_name)


@app.post("/api/chaos/snapshot")
async def trigger_snapshot(req: Optional[SnapshotReq] = None):
    if not controller:
        raise HTTPException(status_code=503, detail="Cluster not initialized")
    target_id = req.node_id if req and req.node_id else None
    return await controller.take_snapshot(target_id)


# =============================================================================
# AI Agent Swarm Coordination Endpoints
# =============================================================================

class AiSimReq(BaseModel):
    scenario: str = Field(default="safe", description="Scenario: 'safe' | 'zombie' | 'chaos'")
    resource: str = Field(default="shared-financial-ledger", description="Resource name to coordinate")


@app.get("/api/ai/status")
async def get_ai_status(resource: str = "shared-financial-ledger"):
    if not ai_coordinator:
        raise HTTPException(status_code=503, detail="AI Coordinator not initialized")
    return ai_coordinator.get_status(resource)


@app.post("/api/ai/simulate")
async def simulate_ai_coordination(req: AiSimReq):
    if not ai_coordinator:
        raise HTTPException(status_code=503, detail="AI Coordinator not initialized")

    if req.scenario == "safe":
        return await ai_coordinator.run_safe_swarm(req.resource)
    elif req.scenario == "zombie":
        return await ai_coordinator.run_zombie_mitigation(req.resource)
    elif req.scenario == "chaos":
        return await ai_coordinator.run_unprotected_chaos(req.resource)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid scenario '{req.scenario}'. Must be 'safe', 'zombie', or 'chaos'.")



# =============================================================================
# WebSocket Stream
# =============================================================================

@app.websocket("/ws")
@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)

    # Send initial cluster status
    if controller:
        try:
            init_status = controller.get_cluster_status()
            await websocket.send_text(json.dumps({
                "type": "INIT",
                "data": init_status,
                "logs": controller.get_node_logs(),
            }))
        except Exception:
            pass

    try:
        while True:
            # Keep connection alive, listen for ping or client actions
            msg = await websocket.receive_text()
            try:
                data = json.loads(msg)
                if data.get("action") == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        connected_websockets.discard(websocket)


# =============================================================================
# Static Files (Frontend UI)
# =============================================================================

frontend_dist = None
for base in [Path(__file__).resolve().parents[3], Path(__file__).resolve().parents[2], Path.cwd(), Path.cwd() / "frontend"]:
    candidate = base / "frontend" / "dist"
    if candidate.exists() and (candidate / "index.html").exists():
        frontend_dist = candidate
        break
    if base.name == "dist" and (base / "index.html").exists():
        frontend_dist = base
        break

if frontend_dist and frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
else:
    from fastapi.responses import HTMLResponse

    @app.get("/", response_class=HTMLResponse)
    async def index_fallback():
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Quorum Control Plane</title>
            <style>
                body { font-family: system-ui, sans-serif; background: #07090e; color: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; max-width: 500px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                h1 { color: #f59e0b; margin-top: 0; }
                code { background: rgba(0,0,0,0.3); color: #38bdf8; padding: 4px 8px; border-radius: 4px; font-size: 0.9rem; }
                a { color: #f59e0b; text-decoration: none; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>⚡ Quorum Gateway Running</h1>
                <p>The backend cluster & WebSocket gateway is active on port 8000.</p>
                <p style="margin: 20px 0;">To build the frontend dashboard, run:<br><code>cd frontend && npm install && npm run build</code></p>
                <p>Or visit the interactive OpenAPI documentation at <a href="/docs">/docs</a>.</p>
            </div>
        </body>
        </html>
        """


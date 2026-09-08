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

logger = logging.getLogger("quorum.gateway.app")

# Global cluster controller instance
controller: Optional[ClusterController] = None
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
    global controller
    logger.info("Starting Quorum Visualizer Gateway...")
    controller = ClusterController(
        node_ids=["node-1", "node-2", "node-3", "node-4", "node-5"],
        on_broadcast_event=broadcast_to_websockets,
    )
    await controller.initialize_cluster()
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


class PartitionReq(BaseModel):
    partitions: List[List[str]] = Field(
        default=[["node-1", "node-2", "node-3"], ["node-4", "node-5"]],
        description="List of node lists representing disjoint network partitions",
    )


class NodeActionReq(BaseModel):
    node_id: str


class NetworkConditionReq(BaseModel):
    latency_ms: float = Field(default=0.0, ge=0.0, le=2000.0)
    packet_loss_rate: float = Field(default=0.0, ge=0.0, le=1.0)


class ZombieSimReq(BaseModel):
    resource_name: str = Field(default="production-orders-db")


# =============================================================================
# REST Endpoints
# =============================================================================

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


# =============================================================================
# WebSocket Stream
# =============================================================================

@app.websocket("/ws")
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


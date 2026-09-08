"""
Convenience launcher from repository root for Quorum Web Control Plane.
"""

import sys
from pathlib import Path

# Add backend to sys.path
BACKEND_ROOT = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(BACKEND_ROOT.resolve()))

from quorum.gateway.app import app

if __name__ == "__main__":
    import uvicorn
    import webbrowser

    port = 8000
    host = "127.0.0.1"
    print("=" * 80)
    print("  QUORUM: DISTRIBUTED CONSENSUS CONTROL PLANE & VISUALIZER")
    print("=" * 80)
    print(f"  • Web Dashboard:  http://{host}:{port}")
    print(f"  • API Swagger:    http://{host}:{port}/docs")
    print(f"  • WebSocket Live: ws://{host}:{port}/ws")
    print("=" * 80)

    try:
        webbrowser.open(f"http://{host}:{port}")
    except Exception:
        pass

    uvicorn.run("quorum.gateway.app:app", host=host, port=port, log_level="info")

"""
One-command launcher for Quorum Web Control Plane and Consensus Visualizer.

Usage:
    python scripts/run_dashboard.py [--port 8000] [--host 127.0.0.1]
"""

import argparse
import os
import sys
import webbrowser
from pathlib import Path

# Add project root to Python module search path
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(PROJECT_ROOT))


def main():
    parser = argparse.ArgumentParser(description="Quorum Real-Time Visualizer Control Plane")
    parser.add_argument("--host", default="127.0.0.1", help="Host address to bind the gateway")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind the gateway")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser automatically")
    args = parser.parse_args()

    print("=" * 80)
    print("  QUORUM: DISTRIBUTED CONSENSUS CONTROL PLANE & VISUALIZER")
    print("=" * 80)
    print(f"  Starting 5-Node Raft Cluster + FastAPI WebSocket Gateway on http://{args.host}:{args.port}")
    print(f"  • Web Dashboard:  http://{args.host}:{args.port}")
    print(f"  • API Swagger:    http://{args.host}:{args.port}/docs")
    print(f"  • WebSocket Live: ws://{args.host}:{args.port}/ws")
    print("=" * 80)

    url = f"http://{args.host}:{args.port}"
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    import uvicorn
    uvicorn.run("quorum.gateway.app:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

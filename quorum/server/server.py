"""
Quorum Node Server.
Bootstraps gRPC server, Raft engine, Lock state machine, and handles graceful shutdown.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import sys
from pathlib import Path
from typing import Dict, List, Optional
import grpc

from quorum.proto import quorum_pb2_grpc, raft_pb2_grpc
from quorum.raft.node import RaftNode
from quorum.raft.rpc_client import GrpcRaftTransport
from quorum.server.client_service import QuorumGrpcServicer
from quorum.server.raft_service import RaftGrpcServicer
from quorum.state_machine.lock_manager import LockStateMachine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("quorum.server")


class QuorumServer:
    """
    Combined Raft and Client gRPC Server for a single Quorum node.
    """

    def __init__(
        self,
        node_id: str,
        peer_addresses: Dict[str, str],  # {node_id: "host:port"}
        listen_address: str,  # "0.0.0.0:50051"
        data_dir: str | Path,
        advertised_client_address: Optional[str] = None,
        min_election_timeout_s: float = 0.15,
        max_election_timeout_s: float = 0.30,
        heartbeat_interval_s: float = 0.05,
    ) -> None:
        self.node_id = node_id
        self.peer_addresses = peer_addresses
        self.listen_address = listen_address
        self.data_dir = Path(data_dir)
        self.self_client_address = advertised_client_address or listen_address

        # State Machine & Raft Core
        self.state_machine = LockStateMachine()
        self.transport = GrpcRaftTransport(self.node_id, self.peer_addresses)
        self.node = RaftNode(
            node_id=self.node_id,
            peers=list(self.peer_addresses.keys()),
            data_dir=self.data_dir,
            transport=self.transport,
            min_election_timeout_s=min_election_timeout_s,
            max_election_timeout_s=max_election_timeout_s,
            heartbeat_interval_s=heartbeat_interval_s,
        )

        # gRPC Server
        self.grpc_server = grpc.aio.server()
        raft_pb2_grpc.add_RaftServiceServicer_to_server(
            RaftGrpcServicer(self.node), self.grpc_server
        )
        quorum_pb2_grpc.add_QuorumServiceServicer_to_server(
            QuorumGrpcServicer(
                node=self.node,
                state_machine=self.state_machine,
                peer_client_addresses=self.peer_addresses,
                self_client_address=self.self_client_address,
            ),
            self.grpc_server,
        )
        self.grpc_server.add_insecure_port(self.listen_address)

    async def start(self) -> None:
        logger.info(f"Starting Quorum Node '{self.node_id}' listening on {self.listen_address}...")
        await self.grpc_server.start()
        await self.node.start()
        logger.info(f"Quorum Node '{self.node_id}' is ready.")

    async def stop(self) -> None:
        logger.info(f"Stopping Quorum Node '{self.node_id}'...")
        await self.node.stop()
        await self.transport.close()
        await self.grpc_server.stop(grace=1.0)
        logger.info(f"Quorum Node '{self.node_id}' stopped.")

    async def serve(self) -> None:
        await self.start()
        stop_event = asyncio.Event()

        def _signal_handler():
            stop_event.set()

        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _signal_handler)
            except (NotImplementedError, AttributeError):
                # Signal handlers not fully supported on some platforms (e.g. Windows non-main thread)
                pass

        try:
            await stop_event.wait()
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        finally:
            await self.stop()


def parse_peer_string(peers_str: str) -> Dict[str, str]:
    """
    Parses peer format: "node2=127.0.0.1:50052,node3=127.0.0.1:50053"
    """
    peers = {}
    if not peers_str:
        return peers
    for part in peers_str.split(","):
        part = part.strip()
        if "=" in part:
            nid, addr = part.split("=", 1)
            peers[nid.strip()] = addr.strip()
    return peers


def main():
    parser = argparse.ArgumentParser(description="Quorum Raft Node Server")
    parser.add_argument("--node-id", default=os.getenv("NODE_ID", "node-1"))
    parser.add_argument("--listen", default=os.getenv("LISTEN_ADDR", "0.0.0.0:50051"))
    parser.add_argument("--advertised", default=os.getenv("ADVERTISED_ADDR", ""))
    parser.add_argument("--peers", default=os.getenv("PEERS", ""))
    parser.add_argument("--data-dir", default=os.getenv("DATA_DIR", "./data/node-1"))
    args = parser.parse_args()

    peer_map = parse_peer_string(args.peers)
    peer_map.pop(args.node_id, None)

    server = QuorumServer(
        node_id=args.node_id,
        peer_addresses=peer_map,
        listen_address=args.listen,
        data_dir=args.data_dir,
        advertised_client_address=args.advertised or args.listen,
    )

    try:
        asyncio.run(server.serve())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

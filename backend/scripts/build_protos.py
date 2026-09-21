"""
Script to generate Python protobuf and gRPC code from proto/*.proto.
Fixes relative imports in generated pb2_grpc files for clean package distribution.
"""

import os
import re
import sys
from pathlib import Path
from grpc_tools import protoc


def build_protos() -> None:
    root_dir = Path(__file__).parent.parent.resolve()
    proto_dir = root_dir / "proto"
    out_dir = root_dir / "quorum" / "proto"
    out_dir.mkdir(parents=True, exist_ok=True)

    proto_files = list(proto_dir.glob("*.proto"))
    if not proto_files:
        print(f"No .proto files found in {proto_dir}")
        sys.exit(1)

    print(f"Compiling {len(proto_files)} proto files from {proto_dir} -> {out_dir}...")

    cmd = [
        "protoc",
        f"-I{proto_dir}",
        f"--python_out={out_dir}",
        f"--grpc_python_out={out_dir}",
    ] + [str(p) for p in proto_files]

    status = protoc.main(cmd)
    if status != 0:
        print(f"protoc failed with status code {status}")
        sys.exit(status)

    # Post-process generated *_pb2_grpc.py to fix relative imports:
    # `import raft_pb2 as raft__pb2` -> `from quorum.proto import raft_pb2 as raft__pb2`
    for py_file in out_dir.glob("*_pb2_grpc.py"):
        content = py_file.read_text(encoding="utf-8")
        for proto in proto_files:
            stem = proto.stem
            pattern = rf"^import ({stem}_pb2) as (.*)"
            replacement = r"from quorum.proto import \1 as \2"
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
            pattern_direct = rf"^import ({stem}_pb2)$"
            replacement_direct = r"from quorum.proto import \1"
            content = re.sub(pattern_direct, replacement_direct, content, flags=re.MULTILINE)
        py_file.write_text(content, encoding="utf-8")

    print("Protobuf compilation completed successfully.")


if __name__ == "__main__":
    build_protos()

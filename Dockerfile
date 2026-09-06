FROM python:3.12-slim

WORKDIR /app

# Install build dependencies
RUN pip install --no-cache-dir --upgrade pip

# Copy project definition and install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy sources and compile protobuf definitions
COPY proto/ proto/
COPY quorum/ quorum/
COPY scripts/ scripts/
RUN python scripts/build_protos.py
RUN pip install --no-cache-dir -e .

# Environment defaults
ENV NODE_ID="node-1"
ENV LISTEN_ADDR="0.0.0.0:50051"
ENV ADVERTISED_ADDR=""
ENV PEERS=""
ENV DATA_DIR="/data"

EXPOSE 50051

VOLUME ["/data"]

ENTRYPOINT ["python", "-m", "quorum.server.server"]

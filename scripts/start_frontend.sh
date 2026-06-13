#!/usr/bin/env bash
# Start WonderCAD Pro-CAD interactive frontend on port 3000 (production build + API).
set -euo pipefail

NODE_DIR="${NODE_DIR:-/dss/dsshome1/0B/go75boj/local/node-v20.18.0-linux-x64}"
RUN_DIR="${RUN_DIR:-/dss/dsshome1/0B/go75boj/local/wondercad-frontend-run}"
SRC_DIR="$(cd "$(dirname "$0")/../frontend" && pwd)"
WONDERCAD_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PROCAD_ROOT="${PROCAD_ROOT:-$WONDERCAD_ROOT/src/Pro-CAD}"
export WONDERCAD_ROOT
LOG="${LOG:-/dss/dsshome1/0B/go75boj/local/wondercad-frontend-dev.log}"
PORT="${PORT:-3000}"

export PATH="$NODE_DIR/bin:$PATH"

if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  echo "Node not found at $NODE_DIR. Install portable node first."
  exit 1
fi

mkdir -p "$RUN_DIR"
rsync -a --delete --exclude node_modules --exclude .sessions "$SRC_DIR/" "$RUN_DIR/"
if [[ -f "$SRC_DIR/.env" ]]; then
  cp "$SRC_DIR/.env" "$RUN_DIR/.env"
elif [[ -f "$WONDERCAD_ROOT/src/Pro-CAD/.env" ]]; then
  cp "$WONDERCAD_ROOT/src/Pro-CAD/.env" "$RUN_DIR/.env"
fi

if [[ ! -d "$RUN_DIR/node_modules" ]]; then
  echo "Installing npm dependencies in $RUN_DIR ..."
  cd "$RUN_DIR" && npm install
fi

echo "Building frontend ..."
cd "$RUN_DIR" && node node_modules/vite/bin/vite.js build

pkill -f "$RUN_DIR/node_modules/.bin/tsx server.ts" 2>/dev/null || true
# Also stop any stale process still bound to PORT
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" 2>/dev/null || true
fi
sleep +2

echo "Starting server on port $PORT (PROCAD_ROOT=$PROCAD_ROOT) ..."
cd "$RUN_DIR"
: > "$LOG"
NODE_ENV=production PROCAD_ROOT="$PROCAD_ROOT" nohup ./node_modules/.bin/tsx server.ts >> "$LOG" 2>&1 &
sleep 4
curl -sf "http://127.0.0.1:$PORT/api/health" && echo ""
STREAM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$PORT/api/procad/generate/stream" \
  -H "Content-Type: application/json" -d '{"prompt":"healthcheck"}' || echo "000")
echo "Stream API check: HTTP $STREAM_CODE (expect 200)"
echo "WonderCAD frontend: http://127.0.0.1:$PORT"
echo "On LRZ login node: http://login-01.ai.lrz.de:$PORT"
echo "Log: $LOG"

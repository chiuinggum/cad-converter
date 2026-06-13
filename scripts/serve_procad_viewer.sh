#!/usr/bin/env bash
# Serve Pro-CAD interactive 3D viewer (required for Three.js ES modules + GLB)
set -euo pipefail
DIR="/dss/dssmcmlfs01/pn46ju/pn46ju-dss-0000/caizhuojiang/wondercad/outputs/procad_interactive"
PORT="${PORT:-8765}"
cd "$DIR"
echo "Serving $DIR"
echo "Open: http://$(hostname -f 2>/dev/null || hostname):${PORT}/"
echo "Or locally: http://127.0.0.1:${PORT}/"
exec python3 -m http.server "$PORT" --bind 0.0.0.0

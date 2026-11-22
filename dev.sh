#!/usr/bin/env bash
# Run fhmusic locally: backend (:8000) + frontend with hot reload (:5173), one command.
# Ctrl+C stops both.  Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

command -v uv >/dev/null || { echo "uv is required: https://docs.astral.sh/uv/"; exit 1; }
command -v npm >/dev/null || { echo "Node.js (npm) is required"; exit 1; }

[ -d web/node_modules ] || (echo "Installing web dependencies..." && cd web && npm install)

# Kill both servers (and their children) when this script exits.
trap 'trap - EXIT INT TERM; kill 0 2>/dev/null' EXIT INT TERM

uv run fhmusic --port 8000 &
backend=$!
(cd web && npm run dev -- --open) &
frontend=$!

echo "fhmusic dev: open http://localhost:5173  (Ctrl+C to stop)"
# If either server dies, stop the other one too (portable: macOS ships bash 3.2, no `wait -n`).
while kill -0 "$backend" 2>/dev/null && kill -0 "$frontend" 2>/dev/null; do sleep 1; done

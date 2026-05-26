#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== TRAIN — Workout Tracker ==="

PORT=8080

# Check if port is already in use
if lsof -i :"$PORT" &>/dev/null 2>&1; then
  echo "Port $PORT in use — trying 8081..."
  PORT=8081
fi

echo "Starting local server on http://localhost:$PORT"
echo "Press Ctrl+C to stop."
echo ""

# Open browser after a short delay
(sleep 1 && \
  if command -v open &>/dev/null; then open "http://localhost:$PORT"; \
  elif command -v xdg-open &>/dev/null; then xdg-open "http://localhost:$PORT"; \
  elif command -v start &>/dev/null; then start "http://localhost:$PORT"; fi \
) &

# Serve the file
if command -v python3 &>/dev/null; then
  python3 -m http.server "$PORT"
elif command -v python &>/dev/null; then
  python -m SimpleHTTPServer "$PORT"
else
  echo "Python not found — opening index.html directly..."
  if command -v open &>/dev/null; then open index.html; fi
fi

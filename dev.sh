#!/usr/bin/env bash
set -e

# ── Local dev launcher ─────────────────────────────────────────────────────────
# Usage:
#   ./dev.sh          # start postgres + next.js + ws server
#   ./dev.sh stop     # stop postgres docker container
# ──────────────────────────────────────────────────────────────────────────────

if [[ "$1" == "stop" ]]; then
  echo "⏹  Stopping dev postgres..."
  docker compose -f docker-compose.dev.yml down
  exit 0
fi

# 1. Start postgres
echo "🐘  Starting dev postgres..."
docker compose -f docker-compose.dev.yml up -d

# 2. Wait until healthy
echo "⏳  Waiting for postgres..."
until docker compose -f docker-compose.dev.yml exec postgres pg_isready -U messme -d messme_dev &>/dev/null; do
  sleep 1
done
echo "✅  Postgres is healthy"

# 3. Migrations
echo "Running prisma migrations..."
npx prisma migrate dev --skip-generate

# 4. Launch both servers, forward Ctrl+C to both
cleanup() {
  echo ""
  echo "🛑  Stopping..."
  kill "$WS_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

echo ""
echo "🚀  Starting services..."
echo "   Next.js   → http://localhost:3000"
echo "   WS server → ws://localhost:3003"
echo ""

npm run dev --prefix mini-services/messenger-server &
WS_PID=$!

npm run dev

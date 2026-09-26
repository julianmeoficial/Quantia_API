#!/usr/bin/env bash
# Quantia API — Cloud Agent install (idempotent repository bootstrap).
# Runs after checkout. Installs local Postgres + Redis (the app's only external
# infra), prepares the .env, installs Node deps, and applies migrations + seed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PG_VERSION=16

echo "==> [1/6] System packages (Postgres ${PG_VERSION} + Redis)"
if ! command -v psql >/dev/null 2>&1 || ! command -v redis-server >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    postgresql postgresql-contrib redis-server
fi

echo "==> [2/6] Start PostgreSQL cluster"
PG_DATA="/var/lib/postgresql/${PG_VERSION}/main"
start_postgres() {
  sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
  for _ in $(seq 1 30); do
    sudo -u postgres pg_isready -q && return 0
    sleep 1
  done
  return 1
}
if ! start_postgres; then
  sudo rm -f "${PG_DATA}/postmaster.pid"
  start_postgres || { echo "ERROR: PostgreSQL failed to start"; exit 1; }
fi

echo "==> [3/6] Start Redis"
redis-cli ping >/dev/null 2>&1 || sudo redis-server --daemonize yes --port 6379 --dir /var/lib/redis

echo "==> [4/6] Ensure quantia role + database"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='quantia'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE quantia LOGIN PASSWORD 'quantia' CREATEDB;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='quantia'" | grep -q 1 \
  || sudo -u postgres createdb -O quantia quantia

echo "==> [5/6] Prepare .env (localhost URLs) + Node dependencies"
if [ ! -f .env ]; then
  sed -e 's#@postgres:5432#@127.0.0.1:5432#g' \
      -e 's#redis://redis:6379#redis://127.0.0.1:6379#g' \
      .env.example > .env
fi
npm ci
npm run build:contracts

echo "==> [6/6] Apply migrations + seed demo data"
npx prisma migrate deploy
npx prisma db seed || echo "seed step reported non-zero (safe to ignore if already seeded)"

echo "==> Install complete."

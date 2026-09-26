#!/usr/bin/env bash
# Quantia API — Cloud Agent start (per-boot service reconciliation).
# Brings up the Postgres cluster and Redis daemon. Idempotent and self-healing:
# a snapshot may capture a stale postmaster.pid whose PID gets reused on the new
# pod, which makes pg_ctlcluster refuse to start — so we clear it when no server
# is actually accepting connections. Terminals then run the API and worker.
set -euo pipefail

PG_VERSION=16
PG_DATA="/var/lib/postgresql/${PG_VERSION}/main"

start_postgres() {
  sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
  for _ in $(seq 1 15); do
    sudo -u postgres pg_isready -q 2>/dev/null && return 0
    sleep 1
  done
  return 1
}

echo "==> Ensuring PostgreSQL cluster is up"
if ! start_postgres; then
  echo "   Postgres did not come up; clearing stale pid and retrying"
  sudo rm -f "${PG_DATA}/postmaster.pid"
  start_postgres || { echo "ERROR: PostgreSQL failed to start"; exit 1; }
fi

echo "==> Ensuring Redis is up"
redis-cli ping >/dev/null 2>&1 || sudo redis-server --daemonize yes --port 6379 --dir /var/lib/redis
for _ in $(seq 1 15); do
  redis-cli ping >/dev/null 2>&1 && break
  sleep 1
done

echo "==> Infrastructure ready (Postgres :5432, Redis :6379)"

#!/usr/bin/env bash
# Quantia API — Cloud Agent start (per-boot service reconciliation).
# Brings up the Postgres cluster and Redis daemon. Idempotent: safe to run when
# services are already up. Terminals then run the API and worker.
set -euo pipefail

PG_VERSION=16

echo "==> Ensuring PostgreSQL cluster is up"
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q 2>/dev/null && break
  sleep 1
done

echo "==> Ensuring Redis is up"
redis-cli ping >/dev/null 2>&1 || sudo redis-server --daemonize yes --port 6379 --dir /var/lib/redis

echo "==> Infrastructure ready (Postgres :5432, Redis :6379)"

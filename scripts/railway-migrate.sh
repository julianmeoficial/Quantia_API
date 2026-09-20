#!/usr/bin/env sh
# One-shot Prisma migrate using the Dockerfile `migrate` stage.
#
# Staging (ENG-156): set DIRECT_URL to Supabase **Session pooler** :5432 on
# *.pooler.supabase.com when Direct db.*:5432 is IPv6-only / unreachable.
# DATABASE_URL for the app remains Transaction pooler :6543 + pgbouncer=true.
#
# Usage:
#   DIRECT_URL=postgresql://... ./scripts/railway-migrate.sh
set -eu

IMAGE_TAG="${IMAGE_TAG:-quantia-api:migrate}"

docker build --target migrate -t "$IMAGE_TAG" .

docker run --rm \
  -e DATABASE_URL="${DATABASE_URL:-$DIRECT_URL}" \
  -e DIRECT_URL="${DIRECT_URL:?DIRECT_URL is required}" \
  "$IMAGE_TAG" \
  npx prisma migrate deploy

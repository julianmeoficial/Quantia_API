#!/usr/bin/env sh
# One-shot Prisma migrate using the Dockerfile `migrate` stage.
# Usage (CI / local smoke against staging DIRECT_URL):
#   DIRECT_URL=postgresql://... ./scripts/railway-migrate.sh
set -eu

IMAGE_TAG="${IMAGE_TAG:-quantia-api:migrate}"

docker build --target migrate -t "$IMAGE_TAG" .

docker run --rm \
  -e DATABASE_URL="${DATABASE_URL:-$DIRECT_URL}" \
  -e DIRECT_URL="${DIRECT_URL:?DIRECT_URL is required}" \
  "$IMAGE_TAG" \
  npx prisma migrate deploy

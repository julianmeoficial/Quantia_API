# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- F0 bootstrap (ENG-121): NestJS skeleton, ConfigModule with Zod validation, Prisma + Redis modules, `GET /api/v1/health`, worker stub, Docker Compose (postgres/redis/migrate/api/worker), multi-stage Dockerfile, GitHub Actions CI, `@quantia/contracts` workspace stub, README and docs.
- Architecture docs: package tree, folder guide, and documentation map in `docs/architecture/overview.md`.
- Docker containment docs: images, containers, multi-stage build and Compose boot order in `docs/architecture/docker.md`.
- F1 auth (ENG-119): users/roles/refresh_tokens, argon2, JWT 15m + rotating refresh with family revoke, global JwtAuthGuard/RolesGuard, `/auth/*` and `/users` endpoints, e2e 401/403/200, contracts + `docs/architecture/auth.md`.

### Fixed

- Docker image default stage is now `runner` (api/worker); `migrate` is an explicit build target so Compose no longer starts the API with `prisma migrate deploy`.
- Docker runner now copies `packages/contracts` so the `@quantia/contracts` workspace symlink resolves at runtime.

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm exec node-pg-migrate up -m design-migrations -t design_pgmigrations "$@"
pnpm exec node-pg-migrate up -m migrations -t hub_pgmigrations "$@"

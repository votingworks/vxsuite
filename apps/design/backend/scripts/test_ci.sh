#!/usr/bin/env bash

# [TODO] Pre-install postgresql-client in the Vx CI docker image.

SCRIPT_DIR="$(dirname "$0")"

sudo apt update && sudo apt install -y --no-install-recommends postgresql-client

sudo -u "${PGUSER}" psql -d "${PGDATABASE}" -f "${SCRIPT_DIR}/../schema.sql"

pnpm vitest run --coverage

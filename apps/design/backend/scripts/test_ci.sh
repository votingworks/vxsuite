#!/usr/bin/env bash

# [TODO] Pre-install postgresql-client in the Vx CI docker image.

SCRIPT_DIR="$(dirname "$0")"

sudo apt update && sudo apt install -y --no-install-recommends postgresql-client

PGUSER=postgres
PGDATABASE=circle_test
DATABASE_URL="postgresql://${PGUSER}@localhost:5432/${PGDATABASE}"

sudo -u "${PGUSER}" psql -d "${PGDATABASE}" -f "${SCRIPT_DIR}/../schema.sql"

DATABASE_URL="${DATABASE_URL}" pnpm vitest run --coverage

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

REQUIRED_PG_MAJOR="${REQUIRED_PG_MAJOR:-15}"
PG_DUMP="${PG_DUMP:-pg_dump}"
SERVER_URL="${DESIGN_SCHEMA_SERVER_URL:-postgresql://design:design@localhost:5432}"
TEMP_DB="design_schema_gen_$$"

dump_major="$("$PG_DUMP" --version | sed -E 's/.* ([0-9]+)\..*/\1/')"
if [[ "$dump_major" != "$REQUIRED_PG_MAJOR" ]]; then
  echo "pg_dump major version $dump_major does not match required $REQUIRED_PG_MAJOR" >&2
  exit 1
fi

psql "$SERVER_URL/postgres" -qc "create database $TEMP_DB"
trap 'psql "$SERVER_URL/postgres" -qc "drop database if exists $TEMP_DB"' EXIT

node scripts/run-design-migrations.mjs "$SERVER_URL/$TEMP_DB"

"$PG_DUMP" --schema-only --no-owner --no-privileges \
  --exclude-table=design_pgmigrations --exclude-table=design_pgmigrations_id_seq \
  "$SERVER_URL/$TEMP_DB" \
  | grep -v -E '^\\(un)?restrict |^SET transaction_timeout|^SELECT pg_catalog\.set_config' \
  > schema.sql

echo "Wrote schema.sql (pg_dump $dump_major)"

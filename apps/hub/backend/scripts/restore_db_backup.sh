#!/usr/bin/env bash

#
# This script bootstraps your local dev env with a production DB snapshot for debugging production
# issues or developing with a representative set of elections.
#

if [ "${#}" -ne 1 ]; then
  echo "Usage: $0 <db-backup>" >&2
  exit 1
fi

DB_BACKUP="${1}"

PGPASSWORD=design dropdb -h localhost -U design design
PGPASSWORD=design createdb -h localhost -U design design
PGPASSWORD=design pg_restore --verbose --clean --no-acl --no-owner -h localhost -U design -d design "${DB_BACKUP}"

# Recreate the dev user used for local development when AUTH_ENABLED=FALSE
pnpm insert-dev-data

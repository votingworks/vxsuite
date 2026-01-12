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

SCRIPTS_DIRECTORY="$(dirname "${BASH_SOURCE[0]}")"
"${SCRIPTS_DIRECTORY}/db_reset_dev.sh"

PGPASSWORD=design pg_restore --verbose --clean --no-acl --no-owner -h localhost -U design -d design "${DB_BACKUP}"

# Insert the dev user used for local development when AUTH_ENABLED=FALSE
PGPASSWORD=design psql -h localhost -U design -d design -c "
  INSERT INTO users (id, type, name, organization_id)
  VALUES (
    'auth0|devuser',
    'support_user',
    'Dev User',
    (SELECT id FROM organizations WHERE name = 'VotingWorks')
  );
"

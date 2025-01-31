#!/usr/bin/env bash
BACKUP=${1:-latest.dump}
PGPASSWORD=design dropdb -U design -h localhost design
PGPASSWORD=design createdb -U design -h localhost design
PGPASSWORD=design pg_restore --verbose --clean --no-acl --no-owner -h localhost -U design -d design $BACKUP

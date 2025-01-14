#!/usr/bin/env bash

# [TODO] Move schema management to migration tool
# (e.g. https://salsita.github.io/node-pg-migrate/)

SCRIPT_DIR="$(dirname "$0")"

if [[ -z $(which psql) ]]; then
  echo "🔴 [ERROR] psql not found - you may need to run install postgres first:"
  echo "    > sudo apt install postgresql"
  echo ""
  exit 1
fi

sudo systemctl start postgresql

sudo -u postgres psql -c "drop database design;"
sudo -u postgres psql -c "drop user design;"

sudo -u postgres psql -c "create user design password 'design';" &&
  sudo -u postgres psql -c "create database design with owner design;" &&
  sudo -u postgres psql -d design -f "${SCRIPT_DIR}/../schema.sql"

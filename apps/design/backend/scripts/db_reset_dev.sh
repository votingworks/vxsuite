#!/usr/bin/env bash

if [[ -z $(which psql) ]]; then
  echo "🔴 [ERROR] psql not found - you may need to run install postgres first:"
  echo "    > sudo apt install postgresql"
  echo ""
  exit 1
fi

sudo systemctl start postgresql

sudo -u postgres psql -c "drop database if exists design;" || exit 1
sudo -u postgres psql -c "drop user if exists design;" || exit 1

sudo -u postgres psql -c "create user design superuser password 'design';" || exit 1
sudo -u postgres psql -c "create database design with owner design;" || exit 1

pnpm db:migrations:run-dev

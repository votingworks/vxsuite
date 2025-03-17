#!/usr/bin/env bash

PGUSER=postgres
PGDATABASE=circle_test
DATABASE_URL="postgresql://${PGUSER}@localhost:5432/${PGDATABASE}"

DATABASE_URL="${DATABASE_URL}" pnpm vitest run --coverage

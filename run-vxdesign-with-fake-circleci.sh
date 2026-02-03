#!/usr/bin/env bash

set -euo pipefail

CIRCLECI_API_TOKEN=test-token \
  CIRCLECI_PROJECT_SLUG=gh/test/repo \
  CIRCLECI_WEBHOOK_SECRET=test-secret \
  CIRCLECI_BASE_URL=http://localhost:9000 \
  BASE_URL=http://localhost:3000 \
  exec pnpm -C apps/design/frontend start

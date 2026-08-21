#!/usr/bin/env bash
# start-with-mock-circleci.sh
#
# Starts VxDesign with automated QA pointed at a CircleCI stand-in on
# localhost, either the mock server (`pnpm mock-circleci-server`) or the vx-qa
# repo's `serve` mode. See ../README.md.
#
# Override any of the defaults below via the environment, e.g.
#   CIRCLECI_BASE_URL=http://localhost:9001 ./start-with-mock-circleci.sh

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CIRCLECI_API_TOKEN="${CIRCLECI_API_TOKEN:-test-token}" \
  CIRCLECI_PROJECT_SLUG="${CIRCLECI_PROJECT_SLUG:-gh/test/repo}" \
  CIRCLECI_WEBHOOK_SECRET="${CIRCLECI_WEBHOOK_SECRET:-test-secret}" \
  CIRCLECI_BASE_URL="${CIRCLECI_BASE_URL:-http://localhost:9000}" \
  BASE_URL="${BASE_URL:-http://localhost:3000}" \
  exec pnpm -C apps/design/frontend start

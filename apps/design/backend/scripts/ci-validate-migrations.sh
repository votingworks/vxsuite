#!/usr/bin/env bash
# ci-validate-migrations.sh
# Usage:
#   ./ci-validate-migrations.sh vs-origin-main  # validate feature branch migrations vs origin/main
#   ./ci-validate-migrations.sh on-origin-main  # validate main branch migrations vs HEAD~1
#   ./ci-validate-migrations.sh                 # auto: detects current branch

set -euo pipefail
export LC_ALL=C

MIGRATION_DIR="${MIGRATION_DIR:-apps/design/backend/migrations}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT" >/dev/null 2>&1
MODE="${1:-auto}"

validate_commits_vs_origin_main() {
  # Fetch origin/main if needed
  git rev-parse --verify --quiet origin/main >/dev/null \
    || git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main

  origin_main_tempfile="$(mktemp)"
  head_tempfile="$(mktemp)"
  trap 'rm -f "$origin_main_tempfile" "$head_tempfile"' EXIT # Clean tempfiles on exit

  # Compare migrations on origin/main vs HEAD
  git ls-tree -r --name-only origin/main -- "$MIGRATION_DIR" | grep -E '\.js$' | sort -u >"$origin_main_tempfile" || true
  git ls-tree -r --name-only HEAD        -- "$MIGRATION_DIR" | grep -E '\.js$' | sort -u >"$head_tempfile" || true
  missing_migrations="$(comm -23 "$origin_main_tempfile" "$head_tempfile" || true)"
  added_migrations="$(comm -13 "$origin_main_tempfile" "$head_tempfile" || true)"

  # Check: If branch adds migrations and is missing ones from main → fail
  if [[ -n "$added_migrations" && -n "$missing_migrations" ]]; then
    echo "Branch adds migrations but is missing migration(s) from main:"
    printf "%s\n" "$missing_migrations"
    echo "Regenerate the added migration(s) with a current timestamp."
    exit 1
  fi

  # Check: If any added migration has a timestamp earlier than main’s newest
  latest_migration_on_main="$(tail -n1 "$origin_main_tempfile" || true)"
  if [[ -n "$added_migrations" && -n "$latest_migration_on_main" ]]; then
    fail=0
    for f in $added_migrations; do
      if [[ ! "$f" > "$latest_migration_on_main" ]]; then
        echo "Migration '$f' must have a timestamp prefix after '$latest_migration_on_main'."
        echo "Regenerate the migration with a current timestamp."
        fail=1
      fi
    done
    if [[ "$fail" -eq 1 ]]; then exit 1; fi
  fi
}

validate_head_vs_prev_commit() {
  # Ensure we have the previous commit
  git rev-parse --verify --quiet HEAD~1 >/dev/null \
    || git fetch --no-tags --depth=2 origin main:refs/remotes/origin/main

  added_migrations="$(git diff --diff-filter=A --name-only HEAD~1..HEAD -- "$MIGRATION_DIR"/*.js || true)"
  [[ -z "$added_migrations" ]] && exit 0
  
  prev_newest_migration="$(git ls-tree -r --name-only HEAD~1 -- "$MIGRATION_DIR" \
      | grep -E '\.js$' | sort | tail -n1 || true
  )"

  # Ensure all added migrations are timestamped after previous newest migration
  fail=0
  for f in $added_migrations; do
    if [[ ! "$f" > "$prev_newest_migration" ]]; then
      echo "Migration '$f' must have timestamp after '$prev_newest_migration'"
      echo "Regenerate the migration with a current timestamp."
      fail=1
    fi
  done
  if [[ "$fail" -eq 1 ]]; then exit 1; fi
}

case "$MODE" in
  vs-origin-main) validate_commits_vs_origin_main ;;
  on-origin-main) validate_head_vs_prev_commit ;;
  auto)
    # Auto-detect if current branch is main and choose appropriate validation
    current_branch="$(git rev-parse --abbrev-ref HEAD)"
    case "$current_branch" in
      main) validate_head_vs_prev_commit ;;
      *)    validate_commits_vs_origin_main ;;
    esac
    ;;
  *)
    echo "Usage: $0 [vs-origin-main|on-origin-main]" >&2
    exit 2
    ;;
esac

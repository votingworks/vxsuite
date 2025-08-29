#!/usr/bin/env bash
# ci-validate-migrations.sh
# Usage: (note - this script looks at committed changes)
#   ./ci-validate-migrations.sh branch # run branch (non-main) checks
#   ./ci-validate-migrations.sh main   # run main-only check
#   ./ci-validate-migrations.sh        # auto: uses $CIRCLE_BRANCH

set -euo pipefail
export LC_ALL=C

MIGRATION_DIR="${MIGRATION_DIR:-apps/design/backend/migrations}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
MODE="${1:-auto}"

run_branch_check() {
  # Fetch origin/main is needed
  git rev-parse --verify --quiet origin/main >/dev/null \
    || git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main

  main_tempfile="$(mktemp)"
  branch_tempfile="$(mktemp)"
  trap 'rm -f "$main_tempfile" "$branch_tempfile"' EXIT # Clean tempfiles on exit

  # Compare migrations on main vs HEAD
  git ls-tree -r --name-only origin/main -- "$MIGRATION_DIR" | grep -E '\.js$' | sort -u >"$main_tempfile" || true
  git ls-tree -r --name-only HEAD        -- "$MIGRATION_DIR" | grep -E '\.js$' | sort -u >"$branch_tempfile" || true
  MISSING="$(comm -23 "$main_tempfile" "$branch_tempfile" || true)"
  ADDED="$(comm -13 "$main_tempfile" "$branch_tempfile" || true)"

  # Rule 1: branch adds migrations and is missing ones from main → fail
  if [[ -n "$ADDED" && -n "$MISSING" ]]; then
    echo "Branch adds migrations but is missing migration(s) from main:"
    printf "%s\n" "$MISSING"
    exit 1
  fi

  # Rule 2: all added migrations must sort after main’s newest
  LATEST_ON_MAIN="$(tail -n1 "$main_tempfile" || true)"
  if [[ -n "$ADDED" && -n "$LATEST_ON_MAIN" ]]; then
    FAIL=0
    for f in $ADDED; do
      if [[ ! "$f" > "$LATEST_ON_MAIN" ]]; then
        echo "Migration '$f' must sort after '$LATEST_ON_MAIN'"
        FAIL=1
      fi
    done
    if [[ "$FAIL" -eq 1 ]]; then exit 1; fi
  fi
}

run_main_check() {
  # Ensure we have the previous commit
  git rev-parse --verify --quiet HEAD~1 >/dev/null \
    || git fetch --no-tags --depth=2 origin main:refs/remotes/origin/main

  ADDED="$(git diff --diff-filter=A --name-only HEAD~1..HEAD -- "$MIGRATION_DIR"/*.js || true)"
  [[ -z "$ADDED" ]] && exit 0
  PREV_LATEST="$(git ls-tree -r --name-only HEAD~1 -- "$MIGRATION_DIR" \
      | grep -E '\.js$' | sort | tail -n1 || true
  )"

  # Ensure all added migrations are timestamped after main's previous latest
  FAIL=0
  for f in $ADDED; do
    if [[ ! "$f" > "$PREV_LATEST" ]]; then
      echo "Migration '$f' must sort after '$PREV_LATEST'"
      FAIL=1
    fi
  done
  if [[ "$FAIL" -eq 1 ]]; then exit 1; fi
}

case "$MODE" in
  branch) run_branch_check ;;
  main) run_main_check ;;
  auto)
    case "${CIRCLE_BRANCH:-}" in
      "")   echo "CIRCLE_BRANCH not set. Run as: $0 [branch|main] or set CIRCLE_BRANCH." >&2; exit 2 ;;
      main) run_main_check ;;
      *)    run_branch_check ;;
    esac
    ;;
  *)
    echo "Usage: $0 [branch|main]" >&2
    exit 2
    ;;
esac

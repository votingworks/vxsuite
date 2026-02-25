#!/usr/bin/env bash
#
# Profile VxSuite dev workflow steps to identify time bottlenecks.
#
# Usage:
#   ./script/profile-dev-workflow.sh              # Run all steps
#   ./script/profile-dev-workflow.sh type-check    # Run one step
#   ./script/profile-dev-workflow.sh type-check tests-single  # Run multiple steps
#
# Output: TSV results in $RESULTS_DIR/ plus a summary sorted by cumulative daily cost.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RESULTS_DIR="${RESULTS_DIR:-$REPO_ROOT/tmp/profile-results}"
mkdir -p "$RESULTS_DIR"
RESULTS_FILE="$RESULTS_DIR/results.tsv"

# ── Helpers ──────────────────────────────────────────────────────────────────

log() { echo "▶ $*" >&2; }
warn() { echo "⚠ $*" >&2; }

# Time a command, append result to TSV, and print it.
# Usage: time_step <step> <package> <command...>
time_step() {
  local step="$1" pkg="$2"
  shift 2
  log "$step | $pkg | $*"
  local start end duration
  start=$(date +%s.%N)
  local rc=0
  "$@" > "$RESULTS_DIR/last-stdout.log" 2> "$RESULTS_DIR/last-stderr.log" || rc=$?
  end=$(date +%s.%N)
  if [ "$rc" -ne 0 ]; then
    warn "  command failed (exit $rc) — still recording time"
  fi
  duration=$(echo "$end - $start" | bc)
  printf '%s\t%s\t%s\n' "$step" "$pkg" "$duration" >> "$RESULTS_FILE"
  printf '  → %.1fs\n' "$duration" >&2
}

# All packages that have a type-check script (relative dirs).
TYPECHECK_PACKAGES=(
  apps/admin/backend apps/admin/frontend
  apps/central-scan/backend apps/central-scan/frontend
  apps/design/backend apps/design/frontend
  apps/mark/backend apps/mark/frontend
  apps/mark-scan/backend apps/mark-scan/frontend
  apps/pollbook/backend apps/pollbook/frontend
  apps/print/backend apps/print/frontend
  apps/scan/backend apps/scan/frontend
  libs/auth libs/backend libs/ballot-encoder libs/ballot-interpreter
  libs/basics libs/bmd-ballot-fixtures libs/cdf-schema-builder
  libs/custom-paper-handler libs/db libs/dev-dock/backend libs/dev-dock/frontend
  libs/eslint-plugin-vx libs/fixture-generators libs/fixtures libs/fs
  libs/fujitsu-thermal-printer libs/grout libs/grout/test-utils
  libs/hmpb libs/image-utils libs/logging libs/mark-flow-ui
  libs/message-coder libs/monorepo-utils libs/pdi-scanner libs/printing
  libs/test-utils libs/types libs/ui libs/usb-drive libs/utils
)

# Packages that have vitest test:run (excluding packages with Rust-only tests).
TEST_PACKAGES=(
  apps/admin/backend apps/admin/frontend
  apps/central-scan/backend apps/central-scan/frontend
  apps/design/frontend apps/design/backend
  apps/mark/backend apps/mark/frontend
  apps/mark-scan/backend apps/mark-scan/frontend
  apps/pollbook/backend apps/pollbook/frontend
  apps/print/backend apps/print/frontend
  apps/scan/backend apps/scan/frontend
  libs/auth libs/backend libs/ballot-encoder
  libs/basics libs/db libs/fs libs/grout libs/grout/test-utils
  libs/hmpb libs/image-utils libs/logging
  libs/mark-flow-ui libs/message-coder libs/monorepo-utils
  libs/printing libs/test-utils libs/types libs/ui libs/usb-drive libs/utils
  libs/bmd-ballot-fixtures libs/cdf-schema-builder libs/custom-paper-handler
  libs/eslint-plugin-vx libs/fixture-generators libs/fixtures
  libs/fujitsu-thermal-printer
)

# Representative test file per package (for single-file test timing).
declare -A SINGLE_TEST_FILES=(
  [apps/admin/frontend]="src/screens/adjudication_summary_screen.test.tsx"
  [apps/admin/backend]="src/reports/titles.test.ts"
  [apps/central-scan/frontend]="src/screens/settings_screen.test.tsx"
  [apps/central-scan/backend]="src/sheet_requires_adjudication.test.ts"
  [apps/design/frontend]="src/load_election_button.test.tsx"
  [apps/design/backend]="src/app.results.test.ts"
  [apps/mark/frontend]="src/app_contest_ms_either_neither.test.tsx"
  [apps/mark/backend]="src/util/print_ballot.test.tsx"
  [apps/mark-scan/frontend]="src/app_contest_ms_either_neither.test.tsx"
  [apps/mark-scan/backend]="src/util/render_ballot.test.ts"
  [apps/pollbook/frontend]="src/voter_details_screen.test.tsx"
  [apps/pollbook/backend]="src/vector_clock.test.ts"
  [apps/print/backend]="src/util/sort.test.ts"
  [apps/scan/frontend]="src/screens/scan_double_sheet_screen.test.tsx"
  [apps/scan/backend]="src/sheet_requires_adjudication.test.ts"
  [libs/auth]="src/cryptography.test.ts"
  [libs/backend]="src/detect_devices.test.ts"
  [libs/ballot-encoder]="src/bits/bit_writer.test.ts"
  [libs/basics]="src/iterators/integers.test.ts"
  [libs/db]="src/client.test.ts"
  [libs/fs]="src/read_file.test.ts"
  [libs/grout]="src/grout.test.ts"
  [libs/hmpb]="src/ballot_templates/nh_ballot_template.test.ts"
  [libs/image-utils]="src/image_data.test.ts"
  [libs/logging]="src/log_event_enums.test.ts"
  [libs/mark-flow-ui]="src/utils/ms_either_neither_contests.test.ts"
  [libs/types]="src/cdf/election-results-reporting/index.test.ts"
  [libs/ui]="src/cast_vote_records.test.ts"
  [libs/usb-drive]="src/block_devices.test.ts"
  [libs/utils]="src/cast_vote_records.test.ts"
)

# App frontends for dev-server profiling.
APP_FRONTENDS=(
  apps/admin/frontend apps/central-scan/frontend apps/design/frontend
  apps/mark/frontend apps/mark-scan/frontend apps/pollbook/frontend
  apps/print/frontend apps/scan/frontend
)

# ── Step: type-check ─────────────────────────────────────────────────────────

step_type_check() {
  log "=== type-check (cold — deleting .tsbuildinfo) ==="
  find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true
  for pkg in "${TYPECHECK_PACKAGES[@]}"; do
    time_step "type-check-cold" "$pkg" pnpm --filter "./$pkg" type-check
  done

  log "=== type-check (warm — cached) ==="
  for pkg in "${TYPECHECK_PACKAGES[@]}"; do
    time_step "type-check-warm" "$pkg" pnpm --filter "./$pkg" type-check
  done
}

# ── Step: tests (full package) ───────────────────────────────────────────────

step_tests() {
  log "=== tests (pnpm test:run per package) ==="
  for pkg in "${TEST_PACKAGES[@]}"; do
    time_step "test-run" "$pkg" pnpm --filter "./$pkg" test:run
  done
}

# ── Step: tests-coverage ─────────────────────────────────────────────────────

step_tests_coverage() {
  log "=== tests with coverage (pnpm test:coverage --run per package) ==="
  for pkg in "${TEST_PACKAGES[@]}"; do
    time_step "test-coverage" "$pkg" pnpm --filter "./$pkg" test:coverage -- --run
  done
}

# ── Step: tests-single ──────────────────────────────────────────────────────

step_tests_single() {
  log "=== single test file per package ==="
  for pkg in "${!SINGLE_TEST_FILES[@]}"; do
    local test_file="${SINGLE_TEST_FILES[$pkg]}"
    time_step "test-single" "$pkg" pnpm --filter "./$pkg" test:run "$test_file"
  done
}

# ── Step: pre-commit ─────────────────────────────────────────────────────────

step_pre_commit() {
  log "=== pre-commit hook profiling ==="

  # Profile individual lint tools on a single file first
  local sample_file="libs/basics/src/iterators/integers.test.ts"
  time_step "prettier" "$sample_file" pnpm exec prettier --check "$sample_file"
  time_step "eslint" "$sample_file" pnpm exec eslint --quiet "$sample_file"

  local frontend_sample="apps/admin/frontend/src/screens/adjudication_summary_screen.test.tsx"
  time_step "prettier" "$frontend_sample" pnpm exec prettier --check "$frontend_sample"
  time_step "eslint" "$frontend_sample" pnpm exec eslint --quiet "$frontend_sample"
  time_step "stylelint" "$frontend_sample" pnpm exec stylelint --quiet "$frontend_sample"

  # Profile lint-staged at different scales by staging benign changes
  # We add a trailing comment to files, stage them, run lint-staged, then revert.
  _profile_lint_staged() {
    local label="$1"
    shift
    local files=("$@")

    # Add a benign comment to each file
    for f in "${files[@]}"; do
      echo "// profile-test" >> "$f"
    done
    git add "${files[@]}"

    time_step "lint-staged" "$label" pnpm exec lint-staged

    # Revert
    git checkout -- "${files[@]}"
    git reset HEAD -- "${files[@]}" > /dev/null 2>&1
  }

  log "--- lint-staged: 1 file in 1 package ---"
  _profile_lint_staged "1-file-1-pkg" "libs/basics/src/iterators/integers.test.ts"

  log "--- lint-staged: 5 files in 1 package ---"
  local five_files=(
    libs/basics/src/iterators/integers.test.ts
    libs/basics/src/iterators/zip.test.ts
    libs/basics/src/async.test.ts
    libs/basics/src/collections.test.ts
    libs/basics/src/result.test.ts
  )
  _profile_lint_staged "5-files-1-pkg" "${five_files[@]}"

  log "--- lint-staged: 1 file in each of 3 packages ---"
  local three_pkgs=(
    libs/basics/src/iterators/integers.test.ts
    libs/types/src/election.test.ts
    libs/utils/src/cast_vote_records.test.ts
  )
  _profile_lint_staged "1-file-3-pkgs" "${three_pkgs[@]}"

  log "--- lint-staged: 10+ files across packages ---"
  local many_files=(
    libs/basics/src/iterators/integers.test.ts
    libs/basics/src/iterators/zip.test.ts
    libs/basics/src/async.test.ts
    libs/basics/src/collections.test.ts
    libs/basics/src/result.test.ts
    libs/types/src/election.test.ts
    libs/types/src/polls.test.ts
    libs/utils/src/cast_vote_records.test.ts
    libs/utils/src/format.test.ts
    libs/auth/src/cryptography.test.ts
    apps/admin/frontend/src/screens/adjudication_summary_screen.test.tsx
  )
  _profile_lint_staged "10+-files-multi-pkg" "${many_files[@]}"
}

# ── Step: dev-server ─────────────────────────────────────────────────────────

step_dev_server() {
  log "=== dev-server startup profiling ==="

  _time_server_start() {
    local pkg="$1" label="$2" port_keyword="ready"
    local app_name
    app_name=$(basename "$(dirname "$pkg")")

    log "Starting dev server for $pkg ($label)..."
    local start end duration
    start=$(date +%s.%N)

    # Start the dev server in background
    (cd "$pkg" && pnpm start) > "$RESULTS_DIR/dev-server-$app_name.log" 2>&1 &
    local pid=$!

    # Wait for "ready" or "compiled" message, with 120s timeout
    local timeout=120 elapsed=0
    while [ "$elapsed" -lt "$timeout" ]; do
      if grep -qiE '(ready in|compiled|VITE.*ready|localhost:[0-9])' "$RESULTS_DIR/dev-server-$app_name.log" 2>/dev/null; then
        break
      fi
      sleep 0.5
      elapsed=$((elapsed + 1))
    done

    end=$(date +%s.%N)
    duration=$(echo "$end - $start" | bc)
    printf '%s\t%s\t%s\n' "dev-server-$label" "$pkg" "$duration" >> "$RESULTS_FILE"
    printf '  → %.1fs\n' "$duration" >&2

    # Kill the dev server
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    sleep 1
  }

  for pkg in "${APP_FRONTENDS[@]}"; do
    local app_name
    app_name=$(basename "$(dirname "$pkg")")

    # Cold: clear vite cache
    rm -rf "$pkg/node_modules/.vite" 2>/dev/null || true
    _time_server_start "$pkg" "cold"

    # Warm: vite cache exists
    _time_server_start "$pkg" "warm"
  done
}

# ── Step: build ──────────────────────────────────────────────────────────────

step_build() {
  log "=== build (cold — deleting .tsbuildinfo) ==="
  find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true
  time_step "build-full-cold" "all" pnpm -r --workspace-concurrency=1 build

  log "=== build (warm — cached) ==="
  time_step "build-full-warm" "all" pnpm -r --workspace-concurrency=1 build

  log "=== build:self per package (warm) ==="
  for pkg in "${TYPECHECK_PACKAGES[@]}"; do
    if (cd "$pkg" && grep -q '"build:self"' package.json 2>/dev/null); then
      time_step "build-self" "$pkg" pnpm --filter "./$pkg" build:self
    fi
  done
}

# ── Summary ──────────────────────────────────────────────────────────────────

# Estimated daily frequencies for cumulative cost calculation.
declare -A STEP_FREQUENCY=(
  [type-check-cold]=2
  [type-check-warm]=10
  [test-run]=7
  [test-coverage]=3
  [test-single]=8
  [lint-staged]=7
  [prettier]=0     # subsumed by lint-staged
  [eslint]=0       # subsumed by lint-staged
  [stylelint]=0    # subsumed by lint-staged
  [dev-server-cold]=2
  [dev-server-warm]=4
  [build-full-cold]=1
  [build-full-warm]=1
  [build-self]=2
)

print_summary() {
  if [ ! -f "$RESULTS_FILE" ]; then
    warn "No results to summarize"
    return
  fi

  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "  RAW RESULTS"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
  printf '%-25s %-40s %10s\n' "STEP" "PACKAGE" "SECONDS"
  printf '%-25s %-40s %10s\n' "----" "-------" "-------"
  sort -t$'\t' -k3 -rn "$RESULTS_FILE" | while IFS=$'\t' read -r step pkg dur; do
    printf '%-25s %-40s %10.1f\n' "$step" "$pkg" "$dur"
  done

  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "  STEP TOTALS (sum across packages)"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
  printf '%-25s %10s %10s %12s\n' "STEP" "TOTAL(s)" "FREQ/DAY" "DAILY COST"
  printf '%-25s %10s %10s %12s\n' "----" "--------" "--------" "----------"

  # Aggregate by step
  awk -F'\t' '{
    step[$1] += $3
    count[$1]++
  } END {
    for (s in step) {
      printf "%s\t%.1f\t%d\n", s, step[s], count[s]
    }
  }' "$RESULTS_FILE" | sort -t$'\t' -k2 -rn | while IFS=$'\t' read -r step total count; do
    freq="${STEP_FREQUENCY[$step]:-1}"
    daily=$(echo "$total * $freq" | bc)
    printf '%-25s %10.1f %10d %10.1fs\n' "$step" "$total" "$freq" "$daily"
  done

  echo ""
  echo "═══════════════════════════════════════════════════════════════════"
  echo "  CUMULATIVE DAILY COST SUMMARY (sorted by daily cost)"
  echo "═══════════════════════════════════════════════════════════════════"
  echo ""
  printf '%-25s %12s\n' "STEP" "DAILY COST"
  printf '%-25s %12s\n' "----" "----------"

  awk -F'\t' '{
    step[$1] += $3
  } END {
    for (s in step) {
      printf "%s\t%.1f\n", s, step[s]
    }
  }' "$RESULTS_FILE" | while IFS=$'\t' read -r step total; do
    freq="${STEP_FREQUENCY[$step]:-1}"
    daily=$(echo "$total * $freq" | bc)
    printf '%s\t%s\n' "$step" "$daily"
  done | sort -t$'\t' -k2 -rn | while IFS=$'\t' read -r step daily; do
    printf '%-25s %10.1fs\n' "$step" "$daily"
  done

  echo ""
  echo "Results saved to: $RESULTS_FILE"
}

# ── Main ─────────────────────────────────────────────────────────────────────

# Clear previous results
> "$RESULTS_FILE"

STEPS=("$@")
if [ ${#STEPS[@]} -eq 0 ]; then
  STEPS=(type-check tests tests-single pre-commit dev-server build)
fi

for step in "${STEPS[@]}"; do
  case "$step" in
    type-check)      step_type_check ;;
    tests)           step_tests ;;
    tests-coverage)  step_tests_coverage ;;
    tests-single)    step_tests_single ;;
    pre-commit)      step_pre_commit ;;
    dev-server)      step_dev_server ;;
    build)           step_build ;;
    *)               warn "Unknown step: $step"; exit 1 ;;
  esac
done

print_summary

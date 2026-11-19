#!/usr/bin/env bash
set -uo pipefail

PERF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z ${VX_PERF_INHIBITED:-} ]] &&
  systemd-inhibit --what=idle:sleep --who=vx-perf --why=check true 2>/dev/null; then
  VX_PERF_INHIBITED=1 exec systemd-inhibit --what=idle:sleep \
    --who=vx-perf --why='Rendering benchmarks' "$0" "$@"
fi
if [[ -z ${VX_PERF_INHIBITED:-} ]]; then
  echo "warning: couldn't block sleep; keep the machine awake yourself" >&2
fi

RESULTS="${RESULTS:-$PERF_DIR/results/experiments-$(date +%Y%m%d-%H%M%S)-$(hostname)}"
BASELINE_S="${BASELINE_S:-60}"
COOLDOWN_S="${COOLDOWN_S:-60}"
REPEAT="${REPEAT:-1}"
INCLUDE_SYSTEM_LIMIT="${INCLUDE_SYSTEM_LIMIT:-1}"
INCLUDE_SANTA_CLARA="${INCLUDE_SANTA_CLARA:-0}"
PRECINCTS="${PRECINCTS:-}"
SCC_PRIMARY_FULL="${SCC_PRIMARY_FULL:-0}"

mkdir -p "$RESULTS"

log() {
  echo "[experiments $(date +%H:%M:%S)] $*" | tee -a "$RESULTS/experiments.log"
}

run() {
  log "start: $*"
  node "$PERF_DIR/run.ts" --out "$RESULTS" ${PRECINCTS:+--precincts "$PRECINCTS"} "$@" 2>&1 | tee -a "$RESULTS/experiments.log"
  local status=${PIPESTATUS[0]}
  log "exit $status: $*"
  if [[ $status -ne 0 ]]; then
    echo "exit $status: $*" >> "$RESULTS/failures.txt"
  fi
  log "cooling down for ${COOLDOWN_S}s"
  sleep "$COOLDOWN_S"
}

log "results: $RESULTS"
log "idle baseline for ${BASELINE_S}s; leave the machine alone"
node "$PERF_DIR/sampler.ts" --out "$RESULTS/00-idle-baseline" --duration-s "$BASELINE_S"

suite_basic() {
  run --election shawnee-general --pool 4
  run --election shawnee-general --pool 4 --fonts served
  run --election shawnee-general --pool 4 --seal none
  run --election shawnee-general --pool 6
  run --election shawnee-general --pool 8
  run --election shawnee-general --pool 6 --fonts served
  run --election shawnee-general --pool 2 --shards 2
  run --election shawnee-general --pool 2 --shards 3
  run --election shawnee-general --pool 2 --shards 2 --fonts served
  if [[ $INCLUDE_SYSTEM_LIMIT == 1 ]]; then
    run --election system-limit --pool 4 --fonts served
  fi
  if [[ $INCLUDE_SANTA_CLARA == 1 ]]; then
    run --election santa-clara --pool 4
    run --election santa-clara --pool 4 --fonts served
  fi
}

suite_shards() {
  run --election system-limit --pool 4 --fonts served
  run --election system-limit --pool 2 --shards 2 --fonts served
  run --election system-limit --pool 2 --shards 3 --fonts served
  run --election system-limit --pool 2 --shards 4 --fonts served
}

suite_pools() {
  for pool in 2 3 4 5 6 8; do
    run --election shawnee-primary --pool "$pool" --fonts served
  done
  run --election system-limit --pool 4 --fonts served
  run --election system-limit --pool 6 --fonts served
}

suite_scc_primary() {
  run --election santa-clara-primary --pool 4 --fonts served \
    --precincts "${PRECINCTS:-100}"
  run --election santa-clara-primary --pool 4 --fonts served \
    --precincts "${PRECINCTS:-250}"
  if [[ $SCC_PRIMARY_FULL == 1 ]]; then
    NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" \
      run --election santa-clara-primary --pool 4 --fonts served
  fi
}

SUITES=("$@")
if [[ ${#SUITES[@]} -eq 0 ]]; then
  SUITES=(basic)
fi
for suite in "${SUITES[@]}"; do
  if ! declare -F "suite_${suite//-/_}" >/dev/null; then
    echo "unknown suite: $suite (basic, shards, pools, scc-primary)" >&2
    exit 1
  fi
done

for _ in $(seq "$REPEAT"); do
  for suite in "${SUITES[@]}"; do
    log "suite: $suite"
    "suite_${suite//-/_}"
  done
done

node "$PERF_DIR/summarize.ts" "$RESULTS"
log "done; see $RESULTS/summary.md"
if [[ -f $RESULTS/failures.txt ]]; then
  log "some runs failed:"
  cat "$RESULTS/failures.txt"
fi

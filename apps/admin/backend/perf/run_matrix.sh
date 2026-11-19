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
RESULTS="${RESULTS:-$PERF_DIR/results/matrix-$(date +%Y%m%d-%H%M%S)-$(hostname)}"
BASELINE_S="${BASELINE_S:-60}"
COOLDOWN_S="${COOLDOWN_S:-60}"
REPEAT="${REPEAT:-1}"
INCLUDE_SYSTEM_LIMIT="${INCLUDE_SYSTEM_LIMIT:-1}"
INCLUDE_SANTA_CLARA="${INCLUDE_SANTA_CLARA:-0}"
PRECINCTS="${PRECINCTS:-}"

mkdir -p "$RESULTS"

log() {
  echo "[matrix $(date +%H:%M:%S)] $*" | tee -a "$RESULTS/matrix.log"
}

run() {
  log "start: $*"
  node "$PERF_DIR/run.ts" --out "$RESULTS" ${PRECINCTS:+--precincts "$PRECINCTS"} "$@" 2>&1 | tee -a "$RESULTS/matrix.log"
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

for _ in $(seq "$REPEAT"); do
  run --election shawnee-general --pool 2
  run --election shawnee-general --pool 4
  run --election shawnee-primary --pool 2
  run --election shawnee-primary --pool 4
  if [[ $INCLUDE_SYSTEM_LIMIT == 1 ]]; then
    run --election system-limit --pool 4
  fi
  if [[ $INCLUDE_SANTA_CLARA == 1 ]]; then
    run --election santa-clara --pool 4
  fi
done

node "$PERF_DIR/summarize.ts" "$RESULTS"
log "done; see $RESULTS/summary.md"
if [[ -f $RESULTS/failures.txt ]]; then
  log "some runs failed:"
  cat "$RESULTS/failures.txt"
fi

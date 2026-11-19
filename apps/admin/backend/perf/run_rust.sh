#!/usr/bin/env bash
set -uo pipefail

PERF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTOTYPE_DIR="${PROTOTYPE_DIR:-$HOME/rust-proto/libs/hmpb-rs}"
BINARY="$PROTOTYPE_DIR/target/release/hmpb-rs"
RESULTS="${RESULTS:-$PERF_DIR/results/rust-$(date +%Y%m%d-%H%M%S)-$(hostname)}"
ELECTIONS="${ELECTIONS:-shawnee-general shawnee-primary system-limit}"
THREADS="${THREADS:-1 2 4 8 $(nproc)}"

if [[ ! -x $BINARY ]]; then
  echo "Build the prototype first; see the README (expected $BINARY)" >&2
  exit 1
fi

mkdir -p "$RESULTS"
LOG="$RESULTS/rust.log"
{
  echo "cpu: $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | xargs)"
  echo "threads available: $(nproc)"
  echo "memory: $(free -h | awk '/Mem:/ {print $2}')"
  echo "git: $(git -C "$PERF_DIR" rev-parse --short HEAD)"
} | tee "$LOG"

for election in $ELECTIONS; do
  jobs_dir="$RESULTS/jobs-$election"
  extra_args=()
  if [[ $election == santa-clara* ]]; then
    extra_args=(--english-only)
  fi
  node "$PERF_DIR/rust_jobs.ts" --election "$election" --out "$jobs_dir" "${extra_args[@]}" | tee -a "$LOG"
  for threads in $THREADS; do
    for by in ballot style; do
      printf '%s threads=%s ' "$election" "$threads" | tee -a "$LOG"
      python3 - "$BINARY" group "$jobs_dir" --by="$by" --threads="$threads" <<'PYTHON' | tee -a "$LOG"
import resource, subprocess, sys
output = subprocess.run(sys.argv[1:], check=True, capture_output=True, text=True).stdout.strip()
peak_mb = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss // 1024
print(f"{output} peak_rss_mb={peak_mb}")
PYTHON
    done
  done
  rm -rf "$jobs_dir"
done

echo "done; results in $LOG"

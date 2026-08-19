#!/usr/bin/env bash
# Byte-identity proof for moving the M404n input slot into printer config.
# See README.md. Usage: run.sh <baseline-worktree>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
BASELINE_REPO="${1:?usage: run.sh <baseline-worktree>}"
BASELINE_PKG="$BASELINE_REPO/libs/printing"
WORK="$HERE/.work"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

rm -rf "$WORK"
mkdir -p "$WORK"/{bin,cap,out}
bash "$HERE/make-shims.sh" "$WORK/bin" "$WORK/cap"

# The baseline worktree needs the same harness, driving its own copy of the
# printer code.
cp "$HERE/cells.ts" "$HERE/driver.ts" "$BASELINE_PKG/scripts/inputslot-proof-tmp/" 2>/dev/null || {
  mkdir -p "$BASELINE_PKG/scripts/inputslot-proof-tmp"
  cp "$HERE/cells.ts" "$HERE/driver.ts" "$BASELINE_PKG/scripts/inputslot-proof-tmp/"
}

run_driver() {
  local pkg="$1" script_dir="$2" uri="$3" out="$4" baseline="$5"
  (
    cd "$pkg"
    export PATH="$WORK/bin:$PATH"
    export VX_PROOF_DEVICE_URI="$uri"
    export VX_PROOF_BASELINE="$baseline"
    node -e "
      require('esbuild-runner').install({type:'transform'});
      process.argv[2] = '$WORK/cap';
      process.argv[3] = '$out';
      require('$pkg/scripts/$script_dir/driver.ts').main().catch(function (e) {
        console.error('driver failed:', e && e.message);
        process.exit(1);
      });
    " >/dev/null
  )
}

# Every supported printer, identified by the URI prefix detection matches on.
URIS=(
  "usb://HP/LaserJet%20Pro%20M404-M405?serial=PROOF|m404n"
  "usb://HP/Color%20LaserJet%20Pro%20M453-4?serial=PROOF|m454"
  "usb://HP/LaserJet%20Pro%204001?serial=PROOF|4001"
  "usb://HP/Color%20LaserJet%20Pro%204201?serial=PROOF|4201"
  "usb://CITIZEN/CT-E351?serial=00000000|citizen"
)

status=0
printf '| printer | cells | identical | differing |\n|---|---|---|---|\n' >"$WORK/report.md"

for entry in "${URIS[@]}"; do
  uri="${entry%|*}"
  name="${entry#*|}"
  log "capturing $name"
  run_driver "$PKG" inputslot-proof "$uri" "$WORK/out/$name.after.json" 0
  run_driver "$BASELINE_PKG" inputslot-proof-tmp "$uri" "$WORK/out/$name.before.json" 1

  node -e "
    const fs = require('fs');
    const before = JSON.parse(fs.readFileSync('$WORK/out/$name.before.json', 'utf8'));
    const after = JSON.parse(fs.readFileSync('$WORK/out/$name.after.json', 'utf8'));
    const diffs = [];
    for (let i = 0; i < before.length; i += 1) {
      const b = before[i], a = after[i];
      if (JSON.stringify(b.argv) !== JSON.stringify(a.argv) || b.stdinSha !== a.stdinSha) {
        diffs.push({ cell: b.cell, before: b.argv.join(' '), after: a.argv.join(' ') });
      }
    }
    fs.writeFileSync('$WORK/out/$name.diff.json', JSON.stringify(diffs, null, 2));
    fs.appendFileSync('$WORK/report.md',
      '| $name | ' + before.length + ' | ' + (before.length - diffs.length) + ' | ' + diffs.length + ' |\n');
    if (diffs.length) {
      console.log('  $name: ' + diffs.length + ' differing cell(s)');
      for (const d of diffs) console.log('    ' + d.cell + '\n      before: ' + d.before + '\n      after:  ' + d.after);
    }
  " || status=1
done

rm -rf "$BASELINE_PKG/scripts/inputslot-proof-tmp"
log "report: $WORK/report.md"
cat "$WORK/report.md"
exit $status

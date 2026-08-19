#!/usr/bin/env bash
# Byte-identity proof for the lpr -> lp migration. See README.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
WORK="$HERE/.work"
PORT=8631
export CUPS_SERVER="localhost:$PORT"

QUICK=0
[[ "${1:-}" == "--quick" ]] && QUICK=1

PPD_DIR="$REPO/libs/printing/supported_printers"
DOC_LETTER="$REPO/libs/hmpb/fixtures/nh-general-election/letter/blank-ballot.pdf"
DOC_LEGAL="$REPO/libs/hmpb/fixtures/nh-general-election/legal/marked-ballot.pdf"

# Lines the filter chain is allowed to vary between two otherwise-identical
# submissions. Anything else that differs fails the cell. Extend ONLY with
# patterns the lpr-vs-lpr baseline itself exhibits.
VOLATILE_PATTERNS=(
  '^%%CreationDate: '
)

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "FATAL: $*"; exit 1; }

# ---------------------------------------------------------------- sandbox ---

CUPSD_PID=""

stop_cupsd() {
  if [[ -n "$CUPSD_PID" ]] && kill -0 "$CUPSD_PID" 2>/dev/null; then
    kill "$CUPSD_PID" 2>/dev/null || true
    wait "$CUPSD_PID" 2>/dev/null || true
  fi
}
trap stop_cupsd EXIT

start_cupsd() {
  rm -rf "$WORK"
  mkdir -p "$WORK"/{spool,capture,logs,out,cache,state,tmp}

  cat >"$WORK/cups-files.conf" <<EOF
ServerRoot $WORK
CacheDir $WORK/cache
StateDir $WORK/state
RequestRoot $WORK/spool
TempDir $WORK/tmp
AccessLog $WORK/logs/access_log
ErrorLog $WORK/logs/error_log
PageLog $WORK/logs/page_log
FileDevice Yes
EOF

  cat >"$WORK/cupsd.conf" <<EOF
LogLevel warn
Listen localhost:$PORT
Browsing Off
PreserveJobHistory Yes
PreserveJobFiles Yes
MaxJobs 4000
<Policy default>
  <Limit All>
    Order deny,allow
    Allow from all
  </Limit>
</Policy>
EOF

  # Debian's AppArmor profile confines /usr/sbin/cupsd to /etc/cups and
  # silently kills it when pointed at our sandbox config (denials only appear
  # in the journal). Profiles attach by binary path, so a copy runs unconfined.
  cp /usr/sbin/cupsd "$WORK/cupsd"
  "$WORK/cupsd" -f -c "$WORK/cupsd.conf" -s "$WORK/cups-files.conf" \
    2>"$WORK/logs/cupsd-stderr.log" &
  CUPSD_PID=$!

  for _ in $(seq 1 100); do
    if lpstat -r >/dev/null 2>&1; then
      log "sandbox cupsd running (pid $CUPSD_PID, port $PORT)"
      return
    fi
    sleep 0.1
  done
  die "sandbox cupsd did not start; see $WORK/logs/error_log"
}

setup_queues() {
  # Mirrors configurePrinter() in src/printer/configure.ts: lpadmin -p -v -P -E
  lpadmin -p vxgeneric -v "file:$WORK/capture/vxgeneric.bin" \
    -P "$PPD_DIR/generic-postscript-driver.ppd" -E
  lpadmin -p vxm404n -v "file:$WORK/capture/vxm404n.bin" \
    -P "$PPD_DIR/hp-laserjet-pro-m404n.ppd" -E
  log "queues configured: vxgeneric, vxm404n"
}

# -------------------------------------------------------------- job cycle ---

NEXT_JOB_ID=1 # sandbox is private and jobs are sequential, so ids are 1,2,3...

# submit <lpr|lp> <queue> <sides> <media> <copies-or-empty> <extra-or-empty> <pdf>
# Argument construction mirrors print.ts exactly: destination, -o sides,
# -o media, -o extras, then copies.
submit() {
  local client=$1 queue=$2 sides=$3 media=$4 copies=$5 extra=$6 pdf=$7
  local cmd=()

  case "$client" in
    lpr) cmd=(lpr -P "$queue") ;;
    lp) cmd=(lp -d "$queue") ;;
    *) die "unknown client $client" ;;
  esac
  cmd+=(-o "sides=$sides" -o "media=$media")
  [[ -n "$extra" ]] && cmd+=(-o "$extra")
  if [[ -n "$copies" ]]; then
    case "$client" in
      lpr) cmd+=(-# "$copies") ;;
      lp) cmd+=(-n "$copies") ;;
    esac
  fi

  local out
  out=$("${cmd[@]}" <"$pdf")

  JOB_ID=$NEXT_JOB_ID
  NEXT_JOB_ID=$((NEXT_JOB_ID + 1))

  # lp reports the id it was assigned; use it to keep our counter honest.
  if [[ "$client" == "lp" ]]; then
    local reported
    reported=$(sed -nE 's/^request id is [^ ]+-([0-9]+).*$/\1/p' <<<"$out")
    [[ "$reported" == "$JOB_ID" ]] ||
      die "job id drift: lp reported ${reported:-none}, expected $JOB_ID"
  fi
}

# wait_done <queue>
wait_done() {
  local queue=$1
  for _ in $(seq 1 600); do
    if ! lpstat -o "$queue" 2>/dev/null | grep -q .; then
      return
    fi
    sleep 0.1
  done
  die "job on $queue did not complete; see $WORK/logs/error_log"
}

# collect <queue> <job-id> <dest-prefix>
# Saves: <prefix>.doc (spooled document), <prefix>.raw (bytes to printer),
# <prefix>.attrs (comparable IPP job attributes), <prefix>.attrs-full.
collect() {
  local queue=$1 id=$2 prefix=$3
  local dfile
  dfile=$(printf "$WORK/spool/d%05d-001" "$id")
  [[ -s "$dfile" ]] || die "missing or empty spool file $dfile"
  cp "$dfile" "$prefix.doc"

  local capture="$WORK/capture/$queue.bin"
  [[ -s "$capture" ]] || die "missing or empty capture file $capture"
  mv "$capture" "$prefix.raw"

  ipptool -tv "ipp://localhost:$PORT/printers/$queue" -d "JOBID=$id" \
    "$HERE/get-job-attrs.test" >"$prefix.attrs-full" ||
    die "ipptool failed for job $id"
  # compare only the response section, excluding per-job identifiers,
  # timestamps, and transient state noise; job-name IS compared
  sed -n '/RECEIVED:/,$p' "$prefix.attrs-full" |
    grep -E '^        [a-zA-Z]' |
    sed 's/^ *//' |
    grep -Ev '^(RECEIVED:|job-id|job-uri|job-uuid|job-more-info|job-printer-up-time|time-at-|date-time-at-|job-originating-host-name|job-media-progress|job-state-reasons|job-printer-state-)' |
    sort >"$prefix.attrs"
  grep -q '^job-name ' "$prefix.attrs" ||
    die "job-name missing from attributes of job $id"
}

# ------------------------------------------------------------- comparison ---

normalize() { # <in> <out>: blank out volatile line content, keep the marker
  local sed_args=()
  for pat in "${VOLATILE_PATTERNS[@]}"; do
    sed_args+=(-e "s/(${pat}).*/\\1<normalized>/")
  done
  sed -E "${sed_args[@]}" "$1" >"$2"
}

# diff_violations <a> <b>: changed lines not matching any volatile pattern
diff_violations() {
  local a=$1 b=$2
  diff "$a" "$b" 2>/dev/null | grep -E '^[<>]' | sed -E 's/^[<>] //' |
    grep -Ev "$(
      IFS='|'
      echo "${VOLATILE_PATTERNS[*]}"
    )" || true
}

sha() { sha256sum "$1" | cut -d' ' -f1; }

CSV="$WORK/cells.csv"
REPORT="$WORK/report.md"
FAILURES=0

# compare_cell <cell-name> <prefix-lpr1> <prefix-lpr2> <prefix-lp>
compare_cell() {
  local cell=$1 lpr1=$2 lpr2=$3 lp=$4
  local doc_ok=PASS attrs_ok=PASS raw_eq=no norm_ok=PASS notes=""

  [[ "$(sha "$lpr1.doc")" == "$(sha "$lp.doc")" &&
    "$(sha "$lpr1.doc")" == "$(sha "$lpr2.doc")" ]] || doc_ok=FAIL

  if ! diff -q "$lpr1.attrs" "$lp.attrs" >/dev/null; then
    attrs_ok=FAIL
    notes+="attr-diff:$(diff "$lpr1.attrs" "$lp.attrs" | grep -cE '^[<>]') "
  fi

  # Baseline: lpr-vs-lpr volatility must itself be within the allowlist,
  # otherwise the allowlist (and the proof) is incomplete for this cell.
  local baseline_viol lp_viol
  baseline_viol=$(diff_violations "$lpr1.raw" "$lpr2.raw")
  lp_viol=$(diff_violations "$lpr1.raw" "$lp.raw")
  [[ "$(sha "$lpr1.raw")" == "$(sha "$lp.raw")" ]] && raw_eq=yes

  if [[ -n "$baseline_viol" ]]; then
    norm_ok=FAIL
    notes+="baseline-volatility-outside-allowlist "
    printf '%s\n' "$baseline_viol" | head -20 >"$WORK/out/$cell.baseline-violations"
  fi
  if [[ -n "$lp_viol" ]]; then
    norm_ok=FAIL
    notes+="lp-diff-outside-allowlist "
    printf '%s\n' "$lp_viol" | head -20 >"$WORK/out/$cell.lp-violations"
  fi
  if [[ "$norm_ok" == PASS && "$raw_eq" == no ]]; then
    # confirm equality after normalizing only allowlisted lines
    normalize "$lpr1.raw" "$lpr1.norm"
    normalize "$lp.raw" "$lp.norm"
    if [[ "$(sha "$lpr1.norm")" != "$(sha "$lp.norm")" ]]; then
      norm_ok=FAIL
      notes+="normalized-mismatch "
    fi
    rm -f "$lpr1.norm" "$lp.norm"
  fi

  local bytes
  bytes=$(wc -c <"$lpr1.raw")
  echo "$cell,$doc_ok,$attrs_ok,$raw_eq,$norm_ok,$bytes,$notes" >>"$CSV"
  if [[ "$doc_ok" == FAIL || "$attrs_ok" == FAIL || "$norm_ok" == FAIL ]]; then
    FAILURES=$((FAILURES + 1))
    log "FAIL $cell ($notes)"
  elif [[ "${KEEP_SAMPLE:-0}" != 1 ]]; then
    rm -f "$lpr1.doc" "$lpr2.doc" "$lp.doc" "$lpr1.raw" "$lpr2.raw" "$lp.raw"
  fi
}

# ------------------------------------------------------------------ matrix ---

run_cell() {
  local queue=$1 doc=$2 sides=$3 media=$4 copies=$5 extra=$6
  local cell="$queue $(basename "$doc" .pdf) $sides $media copies=${copies:-1} ${extra:-none}"
  local id="cell$(printf %04d "$CELL_N")"
  CELL_N=$((CELL_N + 1))

  local prefix
  for tag in lpr1 lpr2 lp; do
    prefix="$WORK/out/$id-$tag"
    submit "${tag%[0-9]}" "$queue" "$sides" "$media" "$copies" "$extra" "$doc"
    wait_done "$queue"
    collect "$queue" "$JOB_ID" "$prefix"
  done
  # keep full artifacts for the first cell of each queue+extra filter path
  KEEP_SAMPLE=0
  if [[ -z "${SEEN_PATHS[$queue|$extra]:-}" ]]; then
    SEEN_PATHS[$queue|$extra]=1
    KEEP_SAMPLE=1
  fi
  compare_cell "$id [$cell]" "$WORK/out/$id-lpr1" "$WORK/out/$id-lpr2" "$WORK/out/$id-lp"
}

negative_case() {
  local lpr_rc=0 lp_rc=0 lpr_err lp_err
  lpr_err=$(lpr -P vxnope -o sides=one-sided <"$DOC_LETTER" 2>&1) || lpr_rc=$?
  lp_err=$(lp -d vxnope -o sides=one-sided <"$DOC_LETTER" 2>&1) || lp_rc=$?
  {
    echo "## Negative case: nonexistent destination"
    echo ""
    echo "| client | exit code | stderr |"
    echo "| --- | --- | --- |"
    echo "| lpr | $lpr_rc | \`$lpr_err\` |"
    echo "| lp | $lp_rc | \`$lp_err\` |"
  } >>"$REPORT"
}

main() {
  start_cupsd
  setup_queues

  declare -gA SEEN_PATHS=()
  echo "cell,doc_identity,ipp_attrs,raw_bytes_equal,normalized,bytes_to_printer,notes" >"$CSV"
  {
    echo "# lpr vs lp byte-identity proof"
    echo ""
    echo "Run: $(date -Iseconds), quick=$QUICK"
    echo ""
    echo '```'
    dpkg-query -W cups cups-filters cups-bsd cups-client ghostscript poppler-utils 2>/dev/null
    gs --version 2>/dev/null | sed 's/^/ghostscript /'
    pdftops -v 2>&1 | head -1
    echo '```'
    echo ""
  } >"$REPORT"

  CELL_N=1
  local queues=(vxgeneric vxm404n) docs=("$DOC_LETTER" "$DOC_LEGAL")
  local sides_list=(one-sided two-sided-long-edge)
  local media_list=(letter legal custom-8.5x17 custom-8.5x22)
  local copies_list=("" 3)

  if [[ $QUICK == 1 ]]; then
    queues=(vxgeneric) docs=("$DOC_LETTER") media_list=(letter custom-8.5x17)
  fi

  for queue in "${queues[@]}"; do
    local extras=("")
    case "$queue" in
      vxgeneric) extras+=("pdftops-renderer=pdftops") ;;
      vxm404n) extras+=("InputSlot=M404n_Tray2") ;;
    esac
    for doc in "${docs[@]}"; do
      for sides in "${sides_list[@]}"; do
        for media in "${media_list[@]}"; do
          for copies in "${copies_list[@]}"; do
            for extra in "${extras[@]}"; do
              run_cell "$queue" "$doc" "$sides" "$media" "$copies" "$extra"
            done
          done
        done
      done
    done
  done

  {
    echo "## Matrix results ($((CELL_N - 1)) cells, $FAILURES failures)"
    echo ""
    echo "| cell | doc identity | ipp attrs | raw bytes equal | normalized | bytes to printer | notes |"
    echo "| --- | --- | --- | --- | --- | --- | --- |"
    sed 1d "$CSV" | sed -E 's/,/ | /g; s/^/| /; s/$/ |/'
    echo ""
  } >>"$REPORT"

  negative_case

  log "done: $((CELL_N - 1)) cells, $FAILURES failures"
  log "report: $REPORT"
  [[ $FAILURES == 0 ]]
}

main

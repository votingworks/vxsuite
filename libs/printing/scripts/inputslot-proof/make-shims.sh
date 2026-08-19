#!/usr/bin/env bash
# Creates stand-ins for the CUPS clients that libs/printing shells out to, so
# the real printer code path can run unmodified and its exact `lp` invocation
# can be captured. Usage: make-shims.sh <bin-dir> <capture-dir>
set -euo pipefail

mkdir -p "$1" "$2"
# Absolute, since the shims run with whatever cwd the caller had.
BIN="$(cd "$1" && pwd)"
CAP="$(cd "$2" && pwd)"

# Reports the device URI under test, in the format getConnectedDeviceUris parses.
cat >"$BIN/lpinfo" <<EOF
#!/usr/bin/env bash
echo "direct \${VX_PROOF_DEVICE_URI}"
EOF

# configurePrinter() only needs this to succeed.
cat >"$BIN/lpadmin" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

# Rich status is not part of what is being proved; returning nothing makes
# getPrinterRichStatus give up quietly.
cat >"$BIN/ipptool" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF

# The capture itself: record argv exactly as received, plus a hash of stdin,
# then emit the job id line print() parses.
cat >"$BIN/lp" <<EOF
#!/usr/bin/env bash
printf '%s\0' "\$@" > "$CAP/lp-argv"
sha256sum | cut -d' ' -f1 > "$CAP/lp-stdin-sha"
echo "request id is VxPrinter-1 (1 file(s))"
EOF

chmod +x "$BIN"/lpinfo "$BIN"/lpadmin "$BIN"/ipptool "$BIN"/lp

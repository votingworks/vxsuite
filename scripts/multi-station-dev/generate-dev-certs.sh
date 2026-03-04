#!/bin/bash
# Generates a self-signed CA and machine certificates for dev IPSec testing.
# In production, certs are TPM-backed. This script creates file-based certs
# for development only.
#
# Usage:
#   ./generate-dev-certs.sh                    # generate CA + cert for this machine
#   ./generate-dev-certs.sh hostname1 hostname2 # generate CA + certs for named machines
#
# After running, copy the dev-certs/ directory to all machines, then run
# setup-ipsec.sh on each.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"

# Check for strongswan-pki
if ! command -v pki &> /dev/null; then
  echo "Error: 'pki' command not found. Install strongswan-pki:"
  echo "  sudo apt install -y strongswan-pki"
  exit 1
fi

mkdir -p "$CERT_DIR"

# Generate CA if it doesn't already exist
if [ ! -f "$CERT_DIR/ca-key.pem" ]; then
  echo "Generating dev CA..."
  pki --gen --type rsa --size 4096 --outform pem > "$CERT_DIR/ca-key.pem"
  pki --self --ca --lifetime 3650 \
    --in "$CERT_DIR/ca-key.pem" \
    --dn "CN=VxAdmin Dev CA" \
    --outform pem > "$CERT_DIR/ca-cert.pem"
  echo "CA created: $CERT_DIR/ca-cert.pem"
else
  echo "CA already exists, reusing."
fi

# Determine which machine names to generate certs for
if [ $# -gt 0 ]; then
  MACHINES=("$@")
else
  MACHINES=("$(hostname)")
fi

for MACHINE in "${MACHINES[@]}"; do
  CERT_FILE="$CERT_DIR/${MACHINE}-cert.pem"
  KEY_FILE="$CERT_DIR/${MACHINE}-key.pem"

  if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "Cert for '$MACHINE' already exists, skipping."
    continue
  fi

  echo "Generating cert for '$MACHINE'..."
  pki --gen --type rsa --size 2048 --outform pem > "$KEY_FILE"
  pki --req --type priv \
    --in "$KEY_FILE" \
    --dn "CN=$MACHINE" \
    --outform pem | \
  pki --issue --lifetime 1825 \
    --cacert "$CERT_DIR/ca-cert.pem" \
    --cakey "$CERT_DIR/ca-key.pem" \
    --flag serverAuth --flag clientAuth \
    --outform pem > "$CERT_FILE"
  echo "  -> $CERT_FILE"
done

echo ""
echo "=== Dev certificates ready ==="
echo "Directory: $CERT_DIR/"
ls -la "$CERT_DIR/"
echo ""
echo "Next steps:"
echo "  1. Copy $CERT_DIR/ to all dev machines"
echo "  2. Run 'sudo ./setup-ipsec.sh' on each machine"
echo ""
echo "WARNING: These are dev-only certs. Do not use in production."

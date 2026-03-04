#!/bin/bash
# Sets up IPSec (strongswan) to encrypt all traffic on the 169.254.0.0/16
# link-local subnet between VxAdmin machines. Uses self-signed certificates
# for dev (production will use TPM-backed certs).
#
# Based on VxPollBook's swanmesh.conf pattern: mutual pubkey auth in transport
# mode, so all ethernet traffic between machines is encrypted.
#
# Prerequisites: run setup-ethernet-networking.sh first.
#
# Usage: sudo ./setup-ipsec.sh
#   Run on ALL machines that need to communicate securely.
#   First run generates a CA + machine cert. Subsequent machines should use
#   the same CA cert (copy ca-cert.pem from the first machine).
#
# For dev convenience, run ./generate-dev-certs.sh first on one machine to
# create a shared CA, then distribute ca-cert.pem to all machines.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"

# Check for required packages
for pkg in strongswan-swanctl libstrongswan-extra-plugins libstrongswan-standard-plugins strongswan-pki; do
  if ! dpkg -l "$pkg" 2>/dev/null | grep -q '^ii'; then
    echo "Installing $pkg..."
    apt install -y "$pkg"
  fi
done

# Check that dev certs have been generated
if [ ! -f "$CERT_DIR/ca-cert.pem" ]; then
  echo "Error: dev certificates not found at $CERT_DIR/"
  echo "Run ./generate-dev-certs.sh first on one machine, then copy"
  echo "the dev-certs/ directory to all machines."
  exit 1
fi

HOSTNAME=$(hostname)
MACHINE_CERT="$CERT_DIR/${HOSTNAME}-cert.pem"
MACHINE_KEY="$CERT_DIR/${HOSTNAME}-key.pem"

if [ ! -f "$MACHINE_CERT" ] || [ ! -f "$MACHINE_KEY" ]; then
  echo "Error: machine cert/key not found for hostname '$HOSTNAME'"
  echo "Expected: $MACHINE_CERT and $MACHINE_KEY"
  echo "Run ./generate-dev-certs.sh $HOSTNAME to generate them."
  exit 1
fi

# Install certificates
echo "Installing certificates..."
cp "$CERT_DIR/ca-cert.pem" /etc/swanctl/x509ca/
cp "$MACHINE_CERT" /etc/swanctl/x509/
cp "$MACHINE_KEY" /etc/swanctl/private/
chmod 600 /etc/swanctl/private/*

# Install swanctl configuration
# Based on VxPollBook's vxdev-swanmesh.conf: transport mode IPSec over
# the link-local subnet with mutual certificate authentication.
cat > /etc/swanctl/conf.d/vxadmin-ethernet.conf << 'SWANCTL'
connections {
  vxadmin_ethernet {
    version = 2
    local_addrs = %any
    remote_addrs = %any

    local {
      certs = MACHINE_CERT_PLACEHOLDER
      auth = pubkey
    }

    remote {
      id = %any
      auth = pubkey
    }

    send_cert = always
    send_certreq = yes

    children {
      net {
        local_ts = 169.254.0.0/16
        remote_ts = 169.254.0.0/16
        start_action = trap
        dpd_action = restart
        mode = transport
      }
    }
  }
}

secrets {
  private_rsa {
    file = MACHINE_KEY_PLACEHOLDER
  }
}

authorities {
  vxadmin_dev {
    cacert = ca-cert.pem
  }
}
SWANCTL

# Replace placeholders with actual filenames
CERT_BASENAME=$(basename "$MACHINE_CERT")
KEY_BASENAME=$(basename "$MACHINE_KEY")
sed -i "s/MACHINE_CERT_PLACEHOLDER/$CERT_BASENAME/" /etc/swanctl/conf.d/vxadmin-ethernet.conf
sed -i "s/MACHINE_KEY_PLACEHOLDER/$KEY_BASENAME/" /etc/swanctl/conf.d/vxadmin-ethernet.conf

# Restart strongswan
echo "Restarting strongswan..."
systemctl enable strongswan 2>/dev/null || systemctl enable strongswan-starter 2>/dev/null || true
systemctl restart strongswan 2>/dev/null || systemctl restart strongswan-starter 2>/dev/null || true

# Load configuration
sleep 1
swanctl --load-all 2>&1 || true

echo ""
echo "=== IPSec configured ==="
echo "Config: /etc/swanctl/conf.d/vxadmin-ethernet.conf"
echo "CA cert: /etc/swanctl/x509ca/ca-cert.pem"
echo "Machine cert: /etc/swanctl/x509/$CERT_BASENAME"
echo ""
echo "Verify with:"
echo "  swanctl --list-conns    # show configured connections"
echo "  swanctl --list-sas      # show active security associations"
echo "  ip xfrm state           # show IPSec state (should show entries after traffic)"
echo ""
echo "Test: ping another machine, then check 'swanctl --list-sas' for an active SA."

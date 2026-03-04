#!/bin/bash
# Undoes setup-ethernet-networking.sh: stops avahi-autoipd and restarts
# NetworkManager so the laptop works normally again.
#
# Usage: sudo ./teardown-ethernet-networking.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

# Stop avahi-autoipd on all interfaces
echo "Stopping avahi-autoipd..."
killall avahi-autoipd 2>/dev/null || true

# Restart NetworkManager
if systemctl list-unit-files NetworkManager.service > /dev/null 2>&1; then
  echo "Restarting NetworkManager..."
  systemctl start NetworkManager
fi

echo "Done. NetworkManager is managing networking again."

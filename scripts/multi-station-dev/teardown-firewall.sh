#!/bin/bash
# Removes firewall rules added by setup-firewall.sh.
#
# Usage: sudo ./teardown-firewall.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

if command -v nft &> /dev/null; then
  nft delete table inet vxadmin 2>/dev/null && echo "Removed nftables vxadmin table." || echo "No nftables rules to remove."
fi

if command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld 2>/dev/null; then
  firewall-cmd --permanent --delete-zone=vxadmin 2>/dev/null && echo "Removed firewalld vxadmin zone." || echo "No firewalld zone to remove."
  firewall-cmd --reload 2>/dev/null || true
fi

echo "Firewall rules cleaned up."

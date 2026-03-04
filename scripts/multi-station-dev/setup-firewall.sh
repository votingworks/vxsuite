#!/bin/bash
# Sets up firewall rules to lock down the ethernet interface so only
# IPSec-encrypted traffic and avahi discovery are allowed.
#
# Based on VxPollBook's pollbook_firewalld.yaml pattern:
# - Default zone: drop (deny all)
# - Ethernet interface: only allow IPSec + avahi
# - Loopback: trusted (allow all local traffic)
#
# Prerequisites: run setup-ethernet-networking.sh first.
#
# Usage: sudo ./setup-firewall.sh [interface]
#   If no interface is given, auto-detects the first ethernet interface.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

IFACE="${1:-}"

# Auto-detect ethernet interface if not specified
if [ -z "$IFACE" ]; then
  for iface in $(ls /sys/class/net/); do
    if [ "$iface" = "lo" ]; then continue; fi
    if [ -d "/sys/class/net/$iface/wireless" ]; then continue; fi
    if [ "$(cat /sys/class/net/$iface/type 2>/dev/null)" = "1" ]; then
      IFACE="$iface"
      break
    fi
  done
fi

if [ -z "$IFACE" ]; then
  echo "Error: no ethernet interface found"
  exit 1
fi

echo "Configuring firewall for interface: $IFACE"

# Check for nftables (preferred on Debian 12+)
if command -v nft &> /dev/null; then
  echo "Using nftables..."

  # Flush existing vxadmin rules if they exist
  nft delete table inet vxadmin 2>/dev/null || true

  nft -f - << EOF
table inet vxadmin {
  chain input {
    type filter hook input priority 0; policy drop;

    # Allow loopback
    iif "lo" accept

    # Allow established/related connections
    ct state established,related accept

    # Allow IPSec (IKE + ESP)
    iifname "$IFACE" udp dport 500 accept   comment "IKE"
    iifname "$IFACE" udp dport 4500 accept  comment "IKE NAT-T"
    iifname "$IFACE" ip protocol esp accept  comment "ESP"

    # Allow avahi/mDNS (link-local multicast)
    iifname "$IFACE" udp dport 5353 accept  comment "mDNS/Avahi"

    # Allow decrypted IPSec traffic (VxAdmin peer API and app traffic)
    # IPSec transport mode decrypts packets before they hit this chain,
    # so we need to allow the application ports after decryption.
    # Policy match: only accept if the traffic arrived via IPSec SA.
    iifname "$IFACE" meta ipsec exists accept comment "IPSec-decrypted traffic"

    # Log and drop everything else
    iifname "$IFACE" log prefix "vxadmin-drop: " drop
  }

  chain output {
    type filter hook output priority 0; policy accept;

    # Allow loopback
    oif "lo" accept

    # Allow IPSec negotiation
    oifname "$IFACE" udp dport 500 accept
    oifname "$IFACE" udp dport 4500 accept
    oifname "$IFACE" ip protocol esp accept

    # Allow avahi/mDNS
    oifname "$IFACE" udp dport 5353 accept

    # Allow IPSec-protected outbound traffic
    oifname "$IFACE" meta ipsec exists accept

    # Drop non-IPSec traffic on the ethernet interface
    oifname "$IFACE" drop
  }
}
EOF

  echo "nftables rules loaded."

elif command -v firewall-cmd &> /dev/null; then
  echo "Using firewalld..."

  systemctl start firewalld
  systemctl enable firewalld

  # Set default zone to drop
  firewall-cmd --set-default-zone=drop

  # Create vxadmin zone if it doesn't exist
  firewall-cmd --permanent --new-zone=vxadmin 2>/dev/null || true

  # Allow IPSec and avahi in the vxadmin zone
  firewall-cmd --permanent --zone=vxadmin --add-service=ipsec
  firewall-cmd --permanent --zone=vxadmin --add-service=mdns
  firewall-cmd --permanent --zone=vxadmin --add-interface="$IFACE"

  # Loopback is trusted
  firewall-cmd --permanent --zone=trusted --add-interface=lo

  firewall-cmd --reload

  echo "firewalld rules loaded."

else
  echo "Error: neither nftables (nft) nor firewalld found."
  echo "Install one: sudo apt install -y nftables"
  exit 1
fi

echo ""
echo "=== Firewall configured ==="
echo "Policy: DROP all traffic on $IFACE except:"
echo "  - IPSec (IKE udp/500, udp/4500, ESP)"
echo "  - Avahi/mDNS (udp/5353)"
echo "  - Any traffic decrypted via IPSec SA"
echo "  - Loopback (all allowed)"
echo ""
echo "Verify with:"
if command -v nft &> /dev/null; then
  echo "  nft list table inet vxadmin"
else
  echo "  firewall-cmd --zone=vxadmin --list-all"
fi
echo ""
echo "Test: traffic between machines should only work after IPSec SA is established."
echo "  1. Without IPSec: ping should be dropped"
echo "  2. With IPSec (setup-ipsec.sh): ping should work"
echo ""
echo "To remove: sudo ./teardown-firewall.sh"

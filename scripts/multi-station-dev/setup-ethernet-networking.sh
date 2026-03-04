#!/bin/bash
# Sets up a dev laptop for multi-station adjudication networking over ethernet.
# Disables NetworkManager, starts avahi-daemon, and uses avahi-autoipd for
# automatic link-local IP assignment (169.254.x.x).
#
# Usage: sudo ./setup-ethernet-networking.sh [interface]
#   If no interface is given, auto-detects the first ethernet interface.
#
# To undo: sudo ./teardown-ethernet-networking.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: must run as root (sudo)"
  exit 1
fi

IFACE="${1:-}"

# Auto-detect ethernet interface if not specified
if [ -z "$IFACE" ]; then
  for iface in $(ls /sys/class/net/); do
    # Skip loopback and wireless
    if [ "$iface" = "lo" ]; then continue; fi
    if [ -d "/sys/class/net/$iface/wireless" ]; then continue; fi
    # Check it's type 1 (ethernet)
    if [ "$(cat /sys/class/net/$iface/type 2>/dev/null)" = "1" ]; then
      IFACE="$iface"
      break
    fi
  done
fi

if [ -z "$IFACE" ]; then
  echo "Error: no ethernet interface found"
  echo "Available interfaces:"
  ip link show
  exit 1
fi

echo "Using ethernet interface: $IFACE"

# Check for required packages
for pkg in avahi-daemon avahi-autoipd; do
  if ! dpkg -l "$pkg" 2>/dev/null | grep -q '^ii'; then
    echo "Installing $pkg..."
    apt install -y "$pkg"
  fi
done

# Stop NetworkManager (conflicts with manual interface management)
if systemctl is-active --quiet NetworkManager 2>/dev/null; then
  echo "Stopping NetworkManager..."
  systemctl stop NetworkManager
fi

# Bring the interface up
echo "Bringing up $IFACE..."
ip link set "$IFACE" up

# Wait for link
echo "Waiting for link on $IFACE..."
for i in $(seq 1 10); do
  if ip link show "$IFACE" | grep -q "state UP"; then
    echo "Link is up"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "Warning: link not detected (cable plugged in?)"
  fi
  sleep 1
done

# Start avahi-daemon
if ! systemctl is-active --quiet avahi-daemon; then
  echo "Starting avahi-daemon..."
  systemctl start avahi-daemon
fi

# Kill any existing avahi-autoipd on this interface
if pgrep -f "avahi-autoipd.*$IFACE" > /dev/null 2>&1; then
  echo "Stopping existing avahi-autoipd on $IFACE..."
  avahi-autoipd --kill "$IFACE" 2>/dev/null || true
  sleep 1
fi

# Start avahi-autoipd to get a link-local IP
echo "Starting avahi-autoipd on $IFACE..."
avahi-autoipd --daemonize --wait "$IFACE"

# Wait for IP assignment
echo "Waiting for IP assignment..."
for i in $(seq 1 15); do
  ASSIGNED_IP=$(ip addr show "$IFACE" | grep "169.254" | awk '{print $2}' | head -1)
  if [ -n "$ASSIGNED_IP" ]; then
    echo "Assigned IP: $ASSIGNED_IP"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "Warning: avahi-autoipd may have failed to assign an IP."
    echo "Falling back to static IP..."
    # Generate a somewhat random link-local address from the MAC
    MAC_LAST=$(ip link show "$IFACE" | awk '/link\/ether/ {print $2}' | awk -F: '{print $5$6}')
    STATIC_IP="169.254.$((16#${MAC_LAST:0:2})).$((16#${MAC_LAST:2:2}))"
    ip addr add "${STATIC_IP}/16" brd 169.254.255.255 dev "$IFACE" 2>/dev/null || true
    echo "Assigned static fallback IP: ${STATIC_IP}/16"
  fi
  sleep 1
done

# Ensure route exists
if ! ip route show | grep -q "169.254.0.0/16.*dev $IFACE"; then
  ip route add 169.254.0.0/16 dev "$IFACE" 2>/dev/null || true
fi

echo ""
echo "=== Ethernet networking ready ==="
echo "Interface: $IFACE"
ip addr show "$IFACE" | grep "inet "
echo ""
echo "Test with:"
echo "  avahi-publish-service \"TestHost\" _vxadmin._tcp 3002"
echo "  avahi-browse -r -t _vxadmin._tcp"
echo ""
echo "To tear down: sudo ./teardown-ethernet-networking.sh"

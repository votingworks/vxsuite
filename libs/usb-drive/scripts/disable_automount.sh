#!/bin/bash

# Installs a udev rule that disables automatic mounting of removable USB block
# devices by udisks2. This replicates the production VxSuite OS environment,
# where automounting is disabled so that VxSuite controls all USB drive mounting.
#
# Must be run as root (e.g. via sudo).

set -euo pipefail

RULES_FILE=/etc/udev/rules.d/85-vx-no-automount.rules

if [[ $EUID -ne 0 ]]; then
    echo 'disable_automount.sh: must be run as root' >&2
    exit 1
fi

cat > "${RULES_FILE}" << 'EOF'
# Disable automatic mounting of removable USB block devices.
# Installed by VxSuite libs/usb-drive/scripts/disable_automount.sh.
ACTION=="add", SUBSYSTEM=="block", ENV{ID_BUS}=="usb", ENV{UDISKS_AUTO}="0"
EOF

udevadm control --reload-rules

echo "Installed ${RULES_FILE}"
echo "Automounting of USB drives is now disabled."
echo "Replug any already-connected USB drives for the rule to take effect."

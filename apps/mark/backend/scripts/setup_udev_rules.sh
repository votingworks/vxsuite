#!/bin/bash

# Installs udev rules that allow the vx user to access the Honeywell CM4680SR
# barcode scanner (VxMark's accessibility barcode scanner).
#
# Must be run as root (e.g. via sudo).
#
# If your user is not already in the 'plugdev' group, add it and re-login:
#   sudo usermod -a -G plugdev $USER

set -euo pipefail

RULES_FILE=/etc/udev/rules.d/60-vx-mark-barcode-scanner.rules

if [[ $EUID -ne 0 ]]; then
    echo 'setup_udev_rules.sh: must be run as root' >&2
    exit 1
fi

# Honeywell CM4680SR (AKA Metrologic Instruments CM4680SR)
# Vendor ID: 0x0c2e, Product ID: 0x10d3
cat > "${RULES_FILE}" << 'EOF'
# Allow plugdev group to access Honeywell CM4680SR barcode scanner (VxMark).
# Installed by VxSuite apps/mark/backend/scripts/setup_udev_rules.sh.
SUBSYSTEM=="usb", ATTRS{idVendor}=="0c2e", ATTRS{idProduct}=="10d3", MODE="0660", GROUP="plugdev"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="0c2e", ATTRS{idProduct}=="10d3", MODE="0660", GROUP="plugdev"
EOF

udevadm control --reload-rules
# Re-apply rules to already-connected devices so a replug isn't required.
udevadm trigger --subsystem-match=usb --attr-match=idVendor=0c2e
udevadm trigger --subsystem-match=hidraw

echo "Installed ${RULES_FILE}"
echo "Device permissions updated. No replug required."
echo "If your user is not in the 'plugdev' group, run: sudo usermod -a -G plugdev \$USER"
echo "Group membership changes require a re-login to take effect."

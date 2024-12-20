#!/bin/bash

set -euo pipefail

usage () {
    echo 'Usage: mount.sh <device>'
    exit 1
}

if ! [[ $# -eq 1 ]]; then
    usage
fi

USB_DRIVE_DEVICE_REGEX=^/dev/sd[a-z][0-9]$
LOOP_DEVICE_REGEX=^/dev/loop[0-9]p[0-9]$

if ! [[ $1 =~ $USB_DRIVE_DEVICE_REGEX || $1 =~ $LOOP_DEVICE_REGEX ]]; then
    echo "mount.sh: device \"${1}\" is not a USB drive"
    exit 1
fi

DEVICE=$1
MOUNTPOINT=/media/vx/usb-drive

# If a drive was previously removed without being ejected first, it may leave a
# "phantom" mounted drive - a mount entry for an inaccessible file system. Although
# "phantom" drives do not cause problems for our application code, the system's 
# file picker will confusingly show multiple drives with the same name. Thus,
# before mounting, we check for a (probably "phantom") mounted drive and
# unmount it if it exists.
if [[  $(findmnt) =~ "$MOUNTPOINT" ]]; then
    SCRIPTS_DIRECTORY="$(dirname "${BASH_SOURCE[0]}")"
    "${SCRIPTS_DIRECTORY}/unmount.sh" "$MOUNTPOINT"
fi

# The mount point will already exist in production but possibly not in development
if ! [[ -e $MOUNTPOINT ]]; then
    mkdir -p $MOUNTPOINT 
fi
mount -w -o umask=000,nosuid,nodev,noexec $DEVICE $MOUNTPOINT

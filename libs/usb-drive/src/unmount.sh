#!/bin/bash

set -euo pipefail

usage () {
    echo 'Usage: unmount-usb.sh'
    exit 1
}

if ! [[ $# -eq 1 ]]; then
    usage
fi

MOUNTPOINT=$1

USER=`logname`
VX_MOUNTPOINT=/media/vx/usb-drive
DEV_MOUNTPOINT_REGEX=^/media/$USER/[a-Z0-9-]+$

if ! [[ $MOUNTPOINT = $VX_MOUNTPOINT || $MOUNTPOINT =~ $DEV_MOUNTPOINT_REGEX ]]; then
    echo "unmount.sh: mount point \"${MOUNTPOINT}\" is not a valid mounted USB drive"
    exit 1
fi

# Run sync before unmounting to force any cached file data to be flushed to the
# removable drive. Used to prevent incomplete file transfers.
sync -f $MOUNTPOINT

umount $MOUNTPOINT
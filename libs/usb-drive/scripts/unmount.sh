#!/bin/bash

set -euo pipefail

usage () {
    echo 'Usage: unmount.sh <mount-point>'
    exit 1
}

if ! [[ $# -eq 1 ]]; then
    usage
fi

MOUNTPOINT=$1

MOUNTPOINT_REGEX=^/media/[[:alnum:]\ -_]+/[[:alnum:]\ -_]+$

if ! [[ "$MOUNTPOINT" =~ $MOUNTPOINT_REGEX ]]; then
    echo "unmount.sh: mount point \"${MOUNTPOINT}\" is not a valid mounted USB drive"
    exit 1
fi

# Run sync before unmounting to force any cached file data to be flushed to the
# removable drive. Used to prevent incomplete file transfers.
sync -f "$MOUNTPOINT"

umount "$MOUNTPOINT"

#!/bin/bash

set -euo pipefail

usage() {
  echo 'Usage: unmount.sh <mount-point>'
  exit 1
}

if ! [[ $# -eq 1 ]]; then
  usage
fi

MOUNTPOINT=$1

# /media/vx may be a symlink and /proc/mounts reports the canonical path the
# kernel received, so resolve our expected prefix to match. `-m` lets this
# work on dev machines where /media/vx may not exist.
MEDIA_DIR=$(realpath -m /media/vx)

# Lock down to exactly what mount.sh produces: <MEDIA_DIR>/usb-drive-<part>,
# where <part> matches mount.sh's PARTITION_DEVICE_REGEX. Keep this regex in
# sync with mount.sh.
LABEL_REGEX='^usb-drive-(sd[a-z]+[0-9]+|nvme[0-9]+n[0-9]+p[0-9]+|mmcblk[0-9]+p[0-9]+)$'
PARENT=$(dirname "$MOUNTPOINT")
LABEL=$(basename "$MOUNTPOINT")
if [[ "$PARENT" != "$MEDIA_DIR" ]] || ! [[ "$LABEL" =~ $LABEL_REGEX ]]; then
  echo "unmount.sh: mount point \"${MOUNTPOINT}\" was not produced by mount.sh"
  exit 1
fi

# Flush cached file data so the drive is safe to remove.
sync -f "$MOUNTPOINT"

umount "$MOUNTPOINT"

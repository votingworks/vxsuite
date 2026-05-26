#!/bin/bash

set -euo pipefail

usage() {
  echo 'Usage: mount.sh <device>'
  exit 1
}

if ! [[ $# -eq 1 ]]; then
  usage
fi

PARTITION_DEVICE_REGEX='^/dev/(sd[a-z]+[0-9]+|nvme[0-9]+n[0-9]+p[0-9]+|mmcblk[0-9]+p[0-9]+)$'

if ! [[ $1 =~ $PARTITION_DEVICE_REGEX ]]; then
  echo "mount.sh: \"${1}\" is not a recognized partition device"
  exit 1
fi

if ! getent passwd vx-services >/dev/null; then
  echo "mount.sh: required user 'vx-services' does not exist"
  exit 1
fi

if ! getent group vx-group >/dev/null; then
  echo "mount.sh: required group 'vx-group' does not exist"
  exit 1
fi

DEVICE=$1
DEVNAME=$(basename "$1")

# Resolve symlinks once so the mountpoint matches what /proc/self/mountinfo
# reports. unmount.sh requires the canonical form.
MOUNTPOINT=$(realpath -m "/media/vx/usb-drive-${DEVNAME}")

# A drive removed without ejecting first leaves a "phantom" mount entry for
# an inaccessible filesystem. Detect and clean it up before mounting fresh.
if findmnt --mountpoint "$MOUNTPOINT" >/dev/null; then
  SCRIPTS_DIRECTORY="$(dirname "${BASH_SOURCE[0]}")"
  "${SCRIPTS_DIRECTORY}/unmount.sh" "$MOUNTPOINT"
fi

# The mount point will already exist in production but possibly not in development
if ! [[ -e $MOUNTPOINT ]]; then
  mkdir -p "$MOUNTPOINT"
fi
FSTYPE=$(blkid -o value -s TYPE "$DEVICE" 2>/dev/null || echo "")

if [[ "$FSTYPE" == "ext4" ]]; then
  mount -t ext4 -w -o nosuid,nodev,noexec,nosymfollow "$DEVICE" "$MOUNTPOINT"
else
  mount -t vfat -w -o uid=vx-services,gid=vx-group,fmask=113,dmask=002,nosuid,nodev,noexec,nosymfollow "$DEVICE" "$MOUNTPOINT"
fi

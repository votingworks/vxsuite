#!/bin/bash

set -euo pipefail

usage () {
    echo 'Usage: format_ext4.sh <device> <label>'
    exit 1
}

DISK_DEVICE_REGEX='^/dev/(sd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$'

DEVICE=${1:-}
LABEL=${2:-}

if [[ -z $DEVICE || -z $LABEL ]]; then
    usage
fi

if ! [[ $DEVICE =~ $DISK_DEVICE_REGEX ]]; then
    echo "error: \"${DEVICE}\" is not a recognized disk device"
    exit 1
fi

if [[ ${#LABEL} -gt 16 ]]; then
    echo "error: \"${LABEL}\" has more than the allowed 16 characters for an ext4 volume label"
    exit 1
fi

# Derive first partition path: nvme and mmcblk use a "p" separator
if [[ $DEVICE =~ (nvme|mmcblk) ]]; then
    PARTITION="${DEVICE}p1"
else
    PARTITION="${DEVICE}1"
fi

# set the partition table type to dos
echo 'label: dos' | sfdisk "${DEVICE}"

# partition the device with a single Linux (type=83) partition
echo 'type=83' | sfdisk --wipe always --wipe-partitions always "${DEVICE}"

# refresh kernel's data on the USB partition table. sfdisk will try to do so,
# but it may fail and not retry if device information is separately being polled
partprobe

# format the partition with an ext4 filesystem. -F avoids interactive
# confirmation prompts when an existing filesystem signature is detected.
mkfs.ext4 -F -L "${LABEL}" "${PARTITION}"

# refresh kernel's data on the USB partition table.
partprobe

# set ownership of the root directory so the application user can write to it.
# mount temporarily, chown, unmount. trap ensures cleanup on failure.
CHOWN_TMPDIR=""
cleanup_tmp_mount() {
    if [[ -n "$CHOWN_TMPDIR" && -d "$CHOWN_TMPDIR" ]]; then
        if mountpoint -q "$CHOWN_TMPDIR"; then
            umount "$CHOWN_TMPDIR" || true
        fi
        rmdir "$CHOWN_TMPDIR" || true
    fi
}
trap cleanup_tmp_mount EXIT

CHOWN_TMPDIR=$(mktemp -d)
mount -o nosuid,nodev,noexec "${PARTITION}" "$CHOWN_TMPDIR"
chown vx:vx "$CHOWN_TMPDIR"
umount "$CHOWN_TMPDIR"
rmdir "$CHOWN_TMPDIR"
CHOWN_TMPDIR=""

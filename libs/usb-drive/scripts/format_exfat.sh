#!/bin/bash

set -euo pipefail

usage() {
  echo 'Usage: format_exfat.sh <device> <label>'
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

if [[ ${#LABEL} -gt 11 ]]; then
  echo "error: \"${LABEL}\" has more than the allowed 11 characters for an exFAT volume label"
  exit 1
fi

# Derive first partition path: nvme and mmcblk use a "p" separator
if [[ $DEVICE =~ (nvme|mmcblk) ]]; then
  PARTITION="${DEVICE}p1"
else
  PARTITION="${DEVICE}1"
fi

echo 'label: dos' | sfdisk "${DEVICE}"
echo 'type=7' | sfdisk --wipe always --wipe-partitions always "${DEVICE}"

# refresh kernel's data on the USB partition table. sfdisk will try to do so,
# but it may fail and not retry if device information is separately being polled
partprobe

# format the partition with an exFAT filesystem using default options for better
# Windows compatibility
mkfs.exfat -L "${LABEL}" "${PARTITION}"

# refresh kernel's data on the USB partition table.
partprobe

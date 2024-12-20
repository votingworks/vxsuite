#!/bin/bash

set -euo pipefail

usage () {
    echo 'Usage: format_fat32.sh <device> <label>'
    exit 1
}

ROOT_DEVICE_REGEX=^/dev/sd[a-z]$

DEVICE=${1:-}
LABEL=${2:-}

if [[ -z $DEVICE || -z $LABEL ]]; then
    usage
fi

if ! [[ $DEVICE =~ $ROOT_DEVICE_REGEX ]]; then
    echo "error: \"${DEVICE}\" is an invalid device. a valid device is of the form /dev/sd[a-z]" 
    exit 1
fi

if [[ ${#LABEL} -gt 11 ]]; then
    echo "error: \"${LABEL}\" has more than the allowed 11 characters for a FAT32 volume label" 
    exit 1
fi

# set the partition table type to dos before using a type=c partition
echo 'label: dos' | sfdisk "${DEVICE}"

# partition the device with a single FAT32 (type=c) partition
echo 'type=c' | sfdisk --wipe always --wipe-partitions always "${DEVICE}"

# refresh kernel's data on the USB partition table. sfdisk will try to do so,
# but it may fail and not retry if device information is separately being polled
partprobe

# format the partition with a FAT32 filesystem, which must be done as root
mkfs.fat -F 32 -n "${LABEL}" "${DEVICE}1"

# refresh kernel's data on the USB partition table.
partprobe

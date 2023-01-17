#!/bin/bash

while getopts s: flag; do
    case "$flag" in
        s) size="$OPTARG";;
        *)
            exit 1
    esac
done

if [ -z "$size" ]; then
    echo "`basename $0`: missing option -s for the size of the virtual USB drive in megabytes"
    exit 1
fi

if [ -e "/dev/disk/by-id/usb-mock-part1" ]; then
    echo "There is currently a virtual USB drive inserted. Remove it before re-initializing the virtual USB drive."
    exit 1
fi

VIRTUAL_DRIVE_IMAGE="`dirname $0`/usb-mock.img"
echo "Initializing ${size}MB virtual USB drive..."

# Create an image for the virtual USB drive
rm -f "$VIRTUAL_DRIVE_IMAGE"
dd if=/dev/zero bs=1M count="$size" of="$VIRTUAL_DRIVE_IMAGE" status=none

# Configure the virtual USB drive
DEVICE=$( losetup -fP --show "$VIRTUAL_DRIVE_IMAGE" ) # Attach loop device
sfdisk -q "$DEVICE" <<< type=c # Partition with single FAT32 partition
mkfs.fat -F 32 -n VIRTUAL-USB "${DEVICE}p1" > /dev/null # Initialize FAT32 filesystem
losetup -d "$DEVICE" # Detach loop device

echo "Done."

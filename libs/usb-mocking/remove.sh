#!/bin/bash

MOCK_BY_ID_ENTRY="/dev/disk/by-id/usb-mock-part1"

if [ -e "$MOCK_BY_ID_ENTRY" ]; then
    DEVICE_PARTITION=$( readlink "$MOCK_BY_ID_ENTRY" )

    # Delete the mock /dev/disk/by-id entry
    rm "$MOCK_BY_ID_ENTRY"

    # Detach the loop device
    losetup -d "/dev/`echo $DEVICE_PARTITION | sed 's/\.\.\/\.\.\/\(.*\)p1/\1/'`"

    # Unmount the drive, because detaching the loop device does not do this automatically
    umount "/media/vx/usb-drive" -q

    echo "Removed virtual USB drive."
else
    echo "There is no virtual USB drive inserted."
fi
#!/bin/bash

DIR=$( dirname $0 )

if [ -e "/dev/disk/by-id/usb-mock-part1" ]; then
    echo "There is currently a virtual USB drive inserted. Remove it before re-initializing the virtual USB drive."
    exit 1
fi

if [ -f "$DIR/usb-mock.img" ]; then
    echo "Virtual USB drive image found..."
else
    echo "No virtual USB drive image found. Initializing a virtual USB drive image with default size of 64MB..."
    bash "$DIR/initialize.sh" -s 64
    echo "To create a larger virtual USB drive image, run 'sudo bash initalize.sh -s <size>' where <size> is the desired size in megabytes."
fi

# Attach the loop device and get its name
DEVICE=$( losetup -fP --show "$DIR/usb-mock.img" )
DEVICE_BASENAME=$( basename "${DEVICE}" )
echo "Virtual USB drive attached."

# Wait for OS to detect filesystem on USB drive partition
DELAY=0.05
DELAY_COUNTER=0
DELAY_MAX_TIMES=10
until [[ $( lsblk -fl | grep "${DEVICE_BASENAME}p1 vfat" ) ]]
do
    echo "Waiting for OS to detect virtual USB drive filesystem..."
    sleep $DELAY
    let DELAY_COUNTER++
    if [ $WAIT_COUNTER > $DELAY_MAX_TIMES ]; then
        echo "Timed out waiting for OS to detect virtual USB drive filesystem."
        break
    fi
done
echo "Virtual USB drive filesystem detected."

# Create a mock entry in /dev/disk/by-id that kiosk-browser can use to detect the USB drive
ln -s "../../${DEVICE_BASENAME}p1" /dev/disk/by-id/usb-mock-part1

echo "Virtual USB drive mock complete."
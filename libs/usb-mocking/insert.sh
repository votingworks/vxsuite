DIR=$( dirname $BASH_SOURCE )

if [ -f "$DIR/usb-mock.img" ]; then
    echo "Virtual USB drive found..."
else
    echo "No virtual USB drive found. Initializing a virtual USB drive with default size of 64MB..."
    bash $DIR/initialize.sh -s 64
    echo "To create a larger virtual USB drive, run 'sudo bash initalize.sh -s <size>' where <size> is the desired size in megabytes."
fi

# Attach the loop device
DEVICE_BASENAME=$( basename $( losetup -fP --show $DIR/usb-mock.img ) )

# Use a delay to allow the OS to detect the filesystems on the loop device partition
sleep 1 

# Create a mock entry in /dev/disk/by-id that kiosk-browser can use to detect the USB drive
ln -s ../../${DEVICE_BASENAME}p1 /dev/disk/by-id/usb-mock-part1

echo "Inserted virtual USB drive."
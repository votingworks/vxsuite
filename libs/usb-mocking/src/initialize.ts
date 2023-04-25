import { $, fs } from 'zx';
import { DEVICE_LOOKUP_LINK, MOCK_IMAGE_PATH } from './shared';

void (async function () {
  let size = 64;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '-s') {
      size = parseInt(process.argv[++i]);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (isNaN(size)) {
    console.error(
      'invalid option -s for the size of the virtual USB drive in megabytes'
    );
    process.exit(1);
  }

  if (await fs.exists(DEVICE_LOOKUP_LINK)) {
    console.log('There is currently a virtual USB drive already inserted.');
    process.exit(1);
  }

  console.log(`Initializing ${size}MB virtual USB drive...`);

  // Create an image for the virtual USB drive
  await fs.rm(MOCK_IMAGE_PATH, { force: true });
  await $`dd if=/dev/zero bs=1M count=${size} of=${MOCK_IMAGE_PATH} status=none`;

  // Configure the virtual USB drive
  const device = // Attach loop device
  (await $`sudo losetup -fP --show ${MOCK_IMAGE_PATH}`.quiet()).stdout.trim();
  // Partition with single FAT32 partition
  await $`sudo sfdisk -q ${device} <<< type=c`.quiet();
  // Initialize FAT32 filesystem
  await $`sudo mkfs.fat -F 32 -n VIRTUAL-USB ${device}p1`.quiet();
  // Detach loop device
  await $`sudo losetup -d ${device}`.quiet();

  console.log('Done.');
})();

/**
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

*/

import { $, fs } from 'zx';
import { DEVICE_LOOKUP_LINK, MOUNT_POINT, findBlockDevice } from './shared';

void (async function () {
  if (await fs.exists(DEVICE_LOOKUP_LINK)) {
    const devicePartition = (await fs.readlink(DEVICE_LOOKUP_LINK)).trim();
    const isMounted = await findBlockDevice(
      (device) => device.mountpoint === MOUNT_POINT
    );

    // Delete the mock /dev/disk/by-id entry
    await $`sudo rm ${DEVICE_LOOKUP_LINK}`;

    const deviceName = devicePartition.replace(/\.\.\/\.\.\/(.*)p1/, '$1');

    // Detach the loop device
    await $`sudo losetup -d /dev/${deviceName}`;

    if (isMounted) {
      // Unmount the drive, because detaching the loop device does not do this automatically
      await $`sudo umount ${MOUNT_POINT} -q`;
    }

    console.log('Removed virtual USB drive.');
  } else {
    console.log('There is no virtual USB drive inserted.');
  }
})();

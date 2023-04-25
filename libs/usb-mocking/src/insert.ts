import { $, fs, path, sleep } from 'zx';
import {
  DEVICE_LOOKUP_LINK,
  MOCK_IMAGE_PATH,
  findBlockDevice,
  hasDevice,
} from './shared';

void (async function () {
  if (await fs.exists(DEVICE_LOOKUP_LINK)) {
    console.log('There is currently a virtual USB drive already inserted.');
    process.exit(1);
  }

  if (await fs.exists(MOCK_IMAGE_PATH)) {
    console.log('Virtual USB drive image found...');
  } else {
    console.log(
      'No virtual USB drive image found. Initializing a virtual USB drive image with default size of 64MB...'
    );
    await $`pnpm initialize -s 64`;
    console.log(
      "To create a larger virtual USB drive image, run 'pnpm initialize -s <size>' where <size> is the desired size in megabytes."
    );
  }

  // Attach the loop device and get its name
  const device = (
    await $`sudo losetup -fP --show ${MOCK_IMAGE_PATH}`
  ).stdout.trim();
  const deviceBasename = path.basename(device);
  console.log('Virtual USB drive attached.');

  // Wait for OS to detect filesystem on USB drive partition
  const delay = 50;
  const delayMaxTimes = 10;
  let delayCounter = 0;

  while (
    !(await findBlockDevice(
      (device, parent) =>
        parent?.name === deviceBasename &&
        device.name === `${deviceBasename}p1` &&
        device.fstype === 'vfat'
    ))
  ) {
    console.log(
      'Waiting for OS to detect filesystem on virtual USB drive partition...'
    );
    await sleep(delay);
    delayCounter++;
    if (delayCounter >= delayMaxTimes) {
      console.log(
        'Timed out waiting for OS to detect virtual USB drive filesystem. Exiting.'
      );
      await $`sudo losetup -d ${device}`;
      process.exit(1);
    }
  }

  console.log('Filesystem detected.');

  // Create a mock entry in /dev/disk/by-id that kiosk-browser can use to detect the USB drive
  await $`sudo ln -s ../../${deviceBasename}p1 ${DEVICE_LOOKUP_LINK}`;

  console.log('Virtual USB drive inserted and ready for use.');
})();

import { $, path } from 'zx';
import { DEVICE_LOOKUP_LINK, MOUNT_POINT } from './shared';

void (async function () {
  await $`sudo mkdir -p ${MOUNT_POINT}`;
  await $`sudo mount -o rw,uid=${process.getuid()},gid=${process.getgid()} ${DEVICE_LOOKUP_LINK} ${MOUNT_POINT}`;
})();

import { $ } from 'zx';
import { join } from 'path';

export const MOCK_IMAGE_PATH = join(process.cwd(), 'usb-mock.img');

export const MOUNT_POINT = '/media/vx/usb-drive';

export const DEVICE_LOOKUP_LINK = '/dev/disk/by-id/usb-mock-part1';

export interface BlockDevice {
  name: string;
  fstype?: string | null;
  mountpoint?: string | null;
  children?: BlockDevice[];
}

export async function getBlockDevices(): Promise<BlockDevice[]> {
  return JSON.parse((await $`lsblk -fJ`.quiet()).stdout).blockdevices;
}

export async function findBlockDevice(
  predicate: (device: BlockDevice, parent?: BlockDevice) => boolean
): Promise<BlockDevice | null> {
  function findBlockDeviceHelper(
    devices: BlockDevice[],
    parent?: BlockDevice
  ): BlockDevice | null {
    for (const device of devices) {
      if (predicate(device, parent)) {
        return device;
      }
      if (device.children) {
        const child = findBlockDeviceHelper(device.children, device);
        if (child) {
          return child;
        }
      }
    }
    return null;
  }

  return findBlockDeviceHelper(await getBlockDevices());
}

export async function hasDevice(
  deviceName: string,
  partition: string,
  fstype: string
): Promise<boolean> {
  return !!(await findBlockDevice(
    (device, parent) =>
      parent?.name === deviceName &&
      device.name === partition &&
      device.fstype === fstype
  ));
}

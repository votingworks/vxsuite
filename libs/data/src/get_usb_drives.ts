import * as fs from 'fs/promises';
import { join } from 'path';
import { execFile } from './utils/exec';

/**
 * A USB drive.
 */
export interface UsbDrive {
  deviceName: string;
  mountPoint?: string;
}

interface BlockDevice {
  name: string;
  mountpoint: string | null;
  partuuid?: string | null;
}

interface RawDataReturn {
  blockdevices: [BlockDevice, ...BlockDevice[]];
}

const DEVICE_PATH_PREFIX = '/dev/disk/by-id/';
const USB_REGEXP = /^usb(.+)part(.*)$/;

/**
 * Gets the USB drives connected to the system, whether they are mounted or not.
 */
export async function getUsbDrives(): Promise<UsbDrive[]> {
  // only the USB partitions
  const devicesById = (await fs.readdir(DEVICE_PATH_PREFIX)).filter((name) =>
    USB_REGEXP.test(name)
  );

  // follow the symlinks
  const devices = await Promise.all(
    devicesById.map(async (deviceId) =>
      join(
        DEVICE_PATH_PREFIX,
        await fs.readlink(join(DEVICE_PATH_PREFIX, deviceId))
      )
    )
  );

  // get the block device info, including mount point
  const usbDrives = await Promise.all(
    devices.map(async (device) => {
      const { stdout } = await execFile('lsblk', ['-J', '-n', '-l', device]);

      const rawData = JSON.parse(stdout) as RawDataReturn;
      return {
        deviceName: rawData.blockdevices[0].name,
        mountPoint: rawData.blockdevices[0].mountpoint ?? undefined,
      };
    })
  );

  return usbDrives;
}

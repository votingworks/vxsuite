import { promises as fs } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { assertDefined } from '@votingworks/basics';
import makeDebug from 'debug';

const exec = promisify(execFile);

const debug = makeDebug('usb-drive');

export type UsbDriveStatus =
  | { status: 'no_drive' }
  | {
      status: 'mounted';
      mountPoint: string;
      /** @deprecated - Temporary for backwards compatibility */
      deviceName: string;
    }
  | { status: 'ejected' }
  | { status: 'error'; reason: 'bad_format' };

export interface UsbDrive {
  status(): Promise<UsbDriveStatus>;
  eject(): Promise<void>;
}

interface BlockDeviceInfo {
  name: string;
  path: string;
  mountpoint: string | null;
  fstype: string | null;
  fsver: string | null;
  label: string | null;
}

async function getBlockDeviceInfo(
  devicePath: string
): Promise<BlockDeviceInfo | undefined> {
  try {
    const { stdout } = await exec('lsblk', [
      '-J',
      '-n',
      '-l',
      '-o',
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL'].join(','),
      devicePath,
    ]);
    const rawData = JSON.parse(stdout) as {
      blockdevices: BlockDeviceInfo[];
    };
    debug(`Got block device info for ${devicePath}: ${stdout}`);
    return { ...assertDefined(rawData.blockdevices[0]), path: devicePath };
  } catch (error) {
    debug(`Error getting block device info for ${devicePath}: ${error}`);
    return undefined;
  }
}

async function findUsbDriveDevice(): Promise<string | undefined> {
  const DEVICE_PATH_PREFIX = '/dev/disk/by-id/';
  const USB_REGEXP = /^usb(.+)part(.*)$/;

  // List devices, filtering to only the USB partitions
  const devicesById = (await fs.readdir(DEVICE_PATH_PREFIX)).filter((name) =>
    USB_REGEXP.test(name)
  );

  // We only support one USB drive at a time
  const [deviceId] = devicesById;
  if (!deviceId) {
    return undefined;
  }

  // Follow the symlink
  const devicePath = join(
    DEVICE_PATH_PREFIX,
    await fs.readlink(join(DEVICE_PATH_PREFIX, deviceId))
  );

  return devicePath;
}

async function getUsbDriveStatus(): Promise<BlockDeviceInfo | undefined> {
  const devicePath = await findUsbDriveDevice();
  if (!devicePath) return undefined;
  debug(`Found USB drive at ${devicePath}`);
  return await getBlockDeviceInfo(devicePath);
}

const VX_MOUNT_POINT = '/media/vx/usb-drive';

async function mountUsbDrive(devicePath: string): Promise<void> {
  debug(`Mounting USB drive ${devicePath} at ${VX_MOUNT_POINT}`);
  await fs.mkdir(VX_MOUNT_POINT, { recursive: true });
  await exec('mount', [
    '-w',
    '-o',
    'umask=000,nosuid,nodev,noexec',
    devicePath,
    VX_MOUNT_POINT,
  ]);
}

async function unmountUsbDrive(mountPoint: string): Promise<void> {
  debug(`Unmounting USB drive at ${mountPoint}`);
  await exec('umount', [mountPoint]);
}

// TODO check format?
export function detectUsbDrive(): UsbDrive {
  let didEject = false;

  return {
    async status(): Promise<UsbDriveStatus> {
      let deviceInfo = await getUsbDriveStatus();
      if (!deviceInfo) return { status: 'no_drive' };
      // Automatically mount the drive if it's not already mounted
      // TODO if the drive is mounted at a different mount point than our
      // default VX mount point, do we want to unmount and remount it?
      if (!deviceInfo.mountpoint && !didEject) {
        await mountUsbDrive(deviceInfo.path);
        deviceInfo = assertDefined(await getUsbDriveStatus());
      }
      if (deviceInfo.mountpoint) {
        return {
          status: 'mounted',
          mountPoint: deviceInfo.mountpoint,
          deviceName: deviceInfo.name,
        };
      }
      return { status: 'ejected' };
    },

    async eject(): Promise<void> {
      const deviceInfo = await getUsbDriveStatus();
      if (!deviceInfo) {
        throw new Error('No USB drive detected');
      }
      if (!deviceInfo.mountpoint) {
        throw new Error('USB drive is not mounted');
      }
      await unmountUsbDrive(deviceInfo.mountpoint);
      didEject = true;
    },
  };
}

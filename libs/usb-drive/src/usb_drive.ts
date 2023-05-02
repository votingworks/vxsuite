import { promises as fs } from 'fs';
import { join } from 'path';
import { assertDefined } from '@votingworks/basics';
import makeDebug from 'debug';
import { exec } from './exec';

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

export interface BlockDeviceInfo {
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
  await exec('sudo', [
    '-n',
    'mount',
    '-w',
    '-o',
    'umask=000,nosuid,nodev,noexec',
    devicePath,
    VX_MOUNT_POINT,
  ]);
}

async function unmountUsbDrive(mountPoint: string): Promise<void> {
  debug(`Unmounting USB drive at ${mountPoint}`);
  await exec('sudo', ['-n', 'umount', mountPoint]);
}

function isFat32(deviceInfo: BlockDeviceInfo): boolean {
  return deviceInfo.fstype === 'vfat' && deviceInfo.fsver === 'FAT32';
}

export function detectUsbDrive(): UsbDrive {
  // Store eject state so we don't immediately remount the drive on
  // the next status call. We don't need to persist this across restarts, so
  // storing in memory is fine.
  let didEject = false;

  return {
    async status(): Promise<UsbDriveStatus> {
      let deviceInfo = await getUsbDriveStatus();
      if (!deviceInfo) {
        return { status: 'no_drive' };
      }
      if (!isFat32(deviceInfo)) {
        return { status: 'error', reason: 'bad_format' };
      }

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

    // TODO do we need to run a `sync` command before unmounting?
    async eject(): Promise<void> {
      const deviceInfo = await getUsbDriveStatus();
      if (!deviceInfo?.mountpoint) {
        debug('No USB drive mounted, skipping eject');
        return;
      }
      await unmountUsbDrive(deviceInfo.mountpoint);
      didEject = true;
    },
  };
}

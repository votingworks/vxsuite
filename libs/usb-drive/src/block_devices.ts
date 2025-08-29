import { assert } from '@votingworks/basics';
import makeDebug from 'debug';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { exec } from './exec';

const debug = makeDebug('usb-drive');

export interface BlockDeviceInfo {
  name: string;
  path: string;
  mountpoint: string | null;
  fstype: string | null;
  fsver: string | null;
  label: string | null;
  type: string;
}

type RawBlockDevice = Omit<BlockDeviceInfo, 'path'>;

async function getBlockDeviceInfo(
  devicePaths: string[]
): Promise<BlockDeviceInfo[]> {
  assert(devicePaths.length > 0);

  try {
    const { stdout } = await exec('lsblk', [
      '-J',
      '-n',
      '-l',
      '-o',
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL', 'TYPE'].join(','),
      ...devicePaths,
    ]);
    const rawData = JSON.parse(stdout) as {
      blockdevices: RawBlockDevice[];
    };
    debug(`Got block device info for ${devicePaths.length} devices: ${stdout}`);
    return rawData.blockdevices.map((rawBlockDevice) => ({
      ...rawBlockDevice,
      path: join('/dev', rawBlockDevice.name),
    }));
  } catch (error) {
    debug(`Error getting block device info: ${error}`);
    return [];
  }
}

async function findUsbDriveDevices(): Promise<string[]> {
  const DEVICE_ID_PATH_PREFIX = '/dev/disk/by-id/';
  const USB_DEVICE_ID_REGEXP = /^usb(.+)part(.*)$/;

  // List devices, filtering to only the USB partitions
  const devicesById = (await fs.readdir(DEVICE_ID_PATH_PREFIX)).filter((name) =>
    USB_DEVICE_ID_REGEXP.test(name)
  );

  return Promise.all(
    devicesById.map(async (deviceId) =>
      join(
        DEVICE_ID_PATH_PREFIX,
        await fs.readlink(join(DEVICE_ID_PATH_PREFIX, deviceId))
      )
    )
  );
}

const DEFAULT_MEDIA_MOUNT_DIR = '/media';

function isDataUsbDrive(blockDeviceInfo: BlockDeviceInfo): boolean {
  return (
    blockDeviceInfo.type === 'part' && // disk partitions only, no disks or logical volumes
    !blockDeviceInfo.fstype?.includes('LVM') && // no partitions acting as LVMs
    (!blockDeviceInfo.mountpoint ||
      blockDeviceInfo.mountpoint.startsWith(DEFAULT_MEDIA_MOUNT_DIR))
  );
}

/**
 * Returns the device info for the USB drive, if it's a removable data drive.
 * In the case of multiple USB drives, returns the first one enumerated by
 * lsblk.
 */
export async function getUsbDriveDeviceInfo(): Promise<
  BlockDeviceInfo | undefined
> {
  const devicePaths = await findUsbDriveDevices();
  if (devicePaths.length === 0) {
    debug(`No USB drives detected`);
    return undefined;
  }

  const blockDeviceInfos = await getBlockDeviceInfo(devicePaths);
  const dataUsbBlockDeviceInfo = blockDeviceInfos.find(isDataUsbDrive);
  if (!dataUsbBlockDeviceInfo) {
    debug(`USB drive detected, but it's not mounted as a removable data drive`);
    return undefined;
  }

  debug(`Detected USB drive at ${dataUsbBlockDeviceInfo.path}`);
  return dataUsbBlockDeviceInfo;
}

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { assert, assertDefined } from '@votingworks/basics';
import makeDebug from 'debug';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { exec } from './exec';
import { UsbDriveStatus, UsbDrive } from './types';
import { MockFileUsbDrive } from './mocks/file_usb_drive';

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

async function getUsbDriveDeviceInfo(): Promise<BlockDeviceInfo | undefined> {
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

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

async function mountUsbDrive(devicePath: string): Promise<void> {
  debug(`Mounting USB drive ${devicePath}`);
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'mount.sh'), devicePath]);
}

async function unmountUsbDrive(mountPoint: string): Promise<void> {
  debug(`Unmounting USB drive at ${mountPoint}`);
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'unmount.sh'), mountPoint]);
}

async function formatUsbDrive(
  devicePath: string,
  label: string
): Promise<void> {
  debug(`Formatting disk ${devicePath} as FAT32 volume with label ${label}`);
  await exec('sudo', [
    '-n',
    join(MOUNT_SCRIPT_PATH, 'format_fat32.sh'),
    devicePath,
    label,
  ]);
}

const CASE_INSENSITIVE_ALPHANUMERICS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomCaseInsensitiveAlphanumeric(): string {
  return assertDefined(
    CASE_INSENSITIVE_ALPHANUMERICS[
      Math.floor(Math.random() * CASE_INSENSITIVE_ALPHANUMERICS.length)
    ]
  );
}

export const VX_USB_LABEL_REGEXP = /VxUSB-[A-Z0-9]{5}/i;

function generateVxUsbLabel(previousLabel?: string): string {
  if (previousLabel && VX_USB_LABEL_REGEXP.test(previousLabel)) {
    return previousLabel;
  }

  let newLabel = 'VxUSB-';

  for (let i = 0; i < 5; i += 1) {
    newLabel += randomCaseInsensitiveAlphanumeric();
  }

  return newLabel;
}

const PARTITION_REGEX = /^(\/dev\/sd[a-z])\d$/;

function getRootDeviceName(deviceName: string): string {
  const match = deviceName.match(PARTITION_REGEX);
  assert(match);
  return assertDefined(match[1]);
}

function isFat32(deviceInfo: BlockDeviceInfo): boolean {
  return deviceInfo.fstype === 'vfat' && deviceInfo.fsver === 'FAT32';
}

async function logMountInit(logger: BaseLogger): Promise<void> {
  await logger.log(LogEventId.UsbDriveMountInit, 'system');
}

async function logMountSuccess(logger: BaseLogger): Promise<void> {
  await logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'success',
    message: 'USB drive successfully mounted.',
  });
}

async function logMountFailure(
  logger: BaseLogger,
  error: Error
): Promise<void> {
  await logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'failure',
    message: 'USB drive failed to mount.',
    error: error.message,
    result: 'USB drive not mounted.',
  });
}

export async function logEjectInit(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.UsbDriveEjectInit);
}

export async function logEjectSuccess(logger: Logger): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
    disposition: 'success',
    message: 'USB drive successfully ejected.',
  });
}

async function logEjectFailure(logger: Logger, error: Error): Promise<void> {
  await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
    disposition: 'failure',
    message: 'USB drive failed to eject.',
    error: error.message,
    result: 'USB drive not ejected.',
  });
}

async function logFormatInit(logger: Logger) {
  await logger.logAsCurrentRole(LogEventId.UsbDriveFormatInit);
}

async function logFormatSuccess(logger: Logger, volumeName: string) {
  await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
    disposition: 'success',
    message: `USB drive successfully formatted with a single FAT32 volume named "${volumeName}".`,
  });
}

async function logFormatFailure(logger: Logger, error: Error) {
  await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
    disposition: 'failure',
    message: `Failed to format USB drive.`,
    error: error.message,
    result: 'USB drive not formatted, error shown to user.',
  });
}

async function mount(
  deviceInfo: BlockDeviceInfo,
  logger: BaseLogger
): Promise<void> {
  await logMountInit(logger);
  try {
    await mountUsbDrive(deviceInfo.path);
    await logMountSuccess(logger);
    debug('USB drive mounted successfully');
  } catch (error) {
    await logMountFailure(logger, error as Error);
    debug(`USB drive mounting failed: ${error}`);
    throw error;
  }
}

type Action = 'mounting' | 'ejecting' | 'formatting';

export function detectUsbDrive(logger: Logger): UsbDrive {
  // Mock USB drives for development and integration tests
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return new MockFileUsbDrive();
  }

  // Store eject state so we don't immediately remount the drive on
  // the next status call. We don't need to persist this across restarts, so
  // storing in memory is fine.
  let didEject = false;

  const actionLock: {
    current?: Action;
  } = { current: undefined };

  function getActionLock(action: Action): boolean {
    if (actionLock.current) {
      debug(
        `Cannot start ${action} while ${actionLock.current} is in progress.`
      );
      return false;
    }
    actionLock.current = action;
    return true;
  }

  function releaseActionLock(): void {
    actionLock.current = undefined;
  }

  return {
    async status(): Promise<UsbDriveStatus> {
      if (actionLock.current === 'formatting') {
        return { status: 'ejected' };
      }

      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo) {
        // Reset eject state in case the drive was removed
        didEject = false;
        return { status: 'no_drive' };
      }
      if (!isFat32(deviceInfo)) {
        return { status: 'error', reason: 'bad_format' };
      }

      // Automatically mount the drive if it's not already mounted
      if (!deviceInfo.mountpoint && !didEject) {
        if (getActionLock('mounting')) {
          void mount(deviceInfo, logger).catch(releaseActionLock);
        }
        return { status: 'no_drive' };
      }

      if (deviceInfo.mountpoint) {
        if (actionLock.current === 'mounting') {
          releaseActionLock();
        }

        return {
          status: 'mounted',
          mountPoint: deviceInfo.mountpoint,
        };
      }
      return { status: 'ejected' };
    },

    async eject(): Promise<void> {
      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo?.mountpoint) {
        debug('No USB drive mounted, skipping eject');
        return;
      }

      if (getActionLock('ejecting')) {
        await logEjectInit(logger);
        try {
          await unmountUsbDrive(deviceInfo.mountpoint);
          didEject = true;
          await logEjectSuccess(logger);
          debug('USB drive ejected successfully');
        } catch (error) {
          await logEjectFailure(logger, error as Error);
          debug(`USB drive ejection failed: ${error}`);
          throw error;
        } finally {
          releaseActionLock();
        }
      }
    },

    async format(): Promise<void> {
      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo) {
        debug('No USB drive detected, skipping format');
        return;
      }

      if (getActionLock('formatting')) {
        await logFormatInit(logger);
        try {
          if (deviceInfo.mountpoint) {
            debug('USB drive is mounted, unmounting before formatting');
            await unmountUsbDrive(deviceInfo.mountpoint);
          }

          const label = generateVxUsbLabel(deviceInfo.label ?? undefined);
          await formatUsbDrive(getRootDeviceName(deviceInfo.path), label);
          await logFormatSuccess(logger, label);
          debug('USB drive formatted successfully');
        } catch (error) {
          await logFormatFailure(logger, error as Error);
          debug(`USB drive formatting failed: ${error}`);
          throw error;
        } finally {
          releaseActionLock();
          didEject = true; // prevent remount
        }
      }
    },

    async sync(): Promise<void> {
      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo?.mountpoint) {
        debug('No USB drive mounted, skipping sync');
        return;
      }
      await exec('sync', ['-f', deviceInfo.mountpoint]);
    },
  };
}

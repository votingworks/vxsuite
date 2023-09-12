import { promises as fs } from 'fs';
import { join } from 'path';
import { assert, assertDefined } from '@votingworks/basics';
import makeDebug from 'debug';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
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
  eject(loggingUserRole: LoggingUserRole): Promise<void>;
  format(loggingUserRole: LoggingUserRole): Promise<void>;
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

async function getUsbDriveDeviceInfo(): Promise<BlockDeviceInfo | undefined> {
  const devicePath = await findUsbDriveDevice();
  if (!devicePath) {
    debug(`No USB drive detected`);
    return undefined;
  }
  debug(`Detected USB drive at ${devicePath}`);
  return await getBlockDeviceInfo(devicePath);
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

async function logMountInit(logger: Logger): Promise<void> {
  await logger.log(LogEventId.UsbDriveMountInit, 'system');
}

async function logMountSuccess(logger: Logger): Promise<void> {
  await logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'success',
    message: 'USB drive successfully mounted.',
  });
}

async function logMountFailure(logger: Logger, error: Error): Promise<void> {
  await logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'failure',
    message: 'USB drive failed to mount.',
    error: error.message,
    result: 'USB drive not mounted.',
  });
}

export async function logEjectInit(
  logger: Logger,
  loggingUserRole: LoggingUserRole
): Promise<void> {
  await logger.log(LogEventId.UsbDriveEjectInit, loggingUserRole);
}

export async function logEjectSuccess(
  logger: Logger,
  loggingUserRole: LoggingUserRole
): Promise<void> {
  await logger.log(LogEventId.UsbDriveEjected, loggingUserRole, {
    disposition: 'success',
    message: 'USB drive successfully ejected.',
  });
}

async function logEjectFailure(
  logger: Logger,
  loggingUserRole: LoggingUserRole,
  error: Error
): Promise<void> {
  await logger.log(LogEventId.UsbDriveEjected, loggingUserRole, {
    disposition: 'failure',
    message: 'USB drive failed to eject.',
    error: error.message,
    result: 'USB drive not ejected.',
  });
}

async function logFormatInit(logger: Logger, loggingUserRole: LoggingUserRole) {
  await logger.log(LogEventId.UsbDriveFormatInit, loggingUserRole);
}

async function logFormatSuccess(
  logger: Logger,
  loggingUserRole: LoggingUserRole,
  volumeName: string
) {
  await logger.log(LogEventId.UsbDriveFormatted, loggingUserRole, {
    disposition: 'success',
    message: `USB drive successfully formatted with a single FAT32 volume named "${volumeName}".`,
  });
}

async function logFormatFailure(
  logger: Logger,
  loggingUserRole: LoggingUserRole,
  error: Error
) {
  await logger.log(LogEventId.UsbDriveFormatted, loggingUserRole, {
    disposition: 'failure',
    message: `Failed to format USB drive.`,
    error: error.message,
    result: 'USB drive not formatted, error shown to user.',
  });
}

async function mount(
  deviceInfo: BlockDeviceInfo,
  logger: Logger
): Promise<void> {
  await logMountInit(logger);
  try {
    await mountUsbDrive(deviceInfo.path);
    await logMountSuccess(logger);
    debug('USB drive mounted successfully');
  } catch (error) {
    await logMountFailure(logger, error as Error);
    debug(`USB drive mounting failed: ${error}`);
  }
}

export function detectUsbDrive(logger: Logger): UsbDrive {
  // Store eject state so we don't immediately remount the drive on
  // the next status call. We don't need to persist this across restarts, so
  // storing in memory is fine.
  let didEject = false;

  // Store mounting state so we don't try to mount the drive multiple times.
  let isMounting = false;

  // The block device info blips during formatting, so we need to track the
  // state and ignore the OS-provided device info during formatting.
  let isFormatting = false;

  return {
    async status(): Promise<UsbDriveStatus> {
      if (isFormatting) {
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
        if (!isMounting) {
          isMounting = true;
          void mount(deviceInfo, logger);
        }
        return { status: 'no_drive' };
      }

      if (deviceInfo.mountpoint) {
        isMounting = false;
        return {
          status: 'mounted',
          mountPoint: deviceInfo.mountpoint,
          deviceName: deviceInfo.name,
        };
      }
      return { status: 'ejected' };
    },

    async eject(loggingUserRole: LoggingUserRole): Promise<void> {
      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo?.mountpoint) {
        debug('No USB drive mounted, skipping eject');
        return;
      }
      await logEjectInit(logger, loggingUserRole);
      try {
        await unmountUsbDrive(deviceInfo.mountpoint);
        didEject = true;
        await logEjectSuccess(logger, loggingUserRole);
        debug('USB drive ejected successfully');
      } catch (error) {
        await logEjectFailure(logger, loggingUserRole, error as Error);
        debug(`USB drive ejection failed: ${error}`);
        throw error;
      }
    },

    async format(loggingUserRole: LoggingUserRole): Promise<void> {
      const deviceInfo = await getUsbDriveDeviceInfo();
      if (!deviceInfo) {
        debug('No USB drive detected, skipping format');
        return;
      }

      isFormatting = true;
      await logFormatInit(logger, loggingUserRole);
      try {
        if (deviceInfo.mountpoint) {
          debug('USB drive is mounted, unmounting before formatting');
          await unmountUsbDrive(deviceInfo.mountpoint);
        }

        const label = generateVxUsbLabel(deviceInfo.label ?? undefined);
        await formatUsbDrive(getRootDeviceName(deviceInfo.path), label);
        await logFormatSuccess(logger, loggingUserRole, label);
        debug('USB drive formatted successfully');
      } catch (error) {
        await logFormatFailure(logger, loggingUserRole, error as Error);
        debug(`USB drive formatting failed: ${error}`);
        throw error;
      } finally {
        isFormatting = false;
        didEject = true; // prevent remount
      }
    },
  };
}

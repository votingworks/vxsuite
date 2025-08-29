import { join } from 'node:path';
import { assert, assertDefined, sleep } from '@votingworks/basics';
import makeDebug from 'debug';
import { LogEventId, BaseLogger, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { exec } from './exec';
import { UsbDriveStatus, UsbDrive } from './types';
import { MockFileUsbDrive } from './mocks/file_usb_drive';
import { BlockDeviceInfo, getUsbDriveDeviceInfo } from './block_devices';

const debug = makeDebug('usb-drive');

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

function logMountInit(logger: BaseLogger): void {
  logger.log(LogEventId.UsbDriveMountInit, 'system');
}

function logMountSuccess(logger: BaseLogger): void {
  logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'success',
    message: 'USB drive successfully mounted.',
  });
}

function logMountFailure(logger: BaseLogger, error: Error): void {
  logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'failure',
    message: 'USB drive failed to mount.',
    error: error.message,
    result: 'USB drive not mounted.',
  });
}

function logMountPointNotFound(logger: BaseLogger): void {
  logger.log(LogEventId.UsbDriveMounted, 'system', {
    disposition: 'failure',
    message:
      'After the USB drive was mounted, the mount point was never detected. The user may have removed the USB drive prematurely.',
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

export const MOUNT_TIMEOUT_MS = 5_000;
export const MOUNT_RETRY_INTERVAL_MS = 100;

async function mount(
  deviceInfo: BlockDeviceInfo,
  logger: BaseLogger
): Promise<void> {
  logMountInit(logger);
  try {
    debug(`mounting drive ${deviceInfo.path}`);
    await mountUsbDrive(deviceInfo.path);
  } catch (error) {
    logMountFailure(logger, error as Error);
    debug(`drive mounting failed: ${error}`);
    return;
  }

  // poll device info for mount point to register
  const start = Date.now();
  while (Date.now() - start < MOUNT_TIMEOUT_MS) {
    debug('polling for mount point after mount...');
    const updatedDeviceInfo = await getUsbDriveDeviceInfo();
    if (updatedDeviceInfo?.mountpoint) {
      logMountSuccess(logger);
      debug('mount point found, drive mounted successfully');
      return;
    }
    await sleep(MOUNT_RETRY_INTERVAL_MS);
  }
  logMountPointNotFound(logger);
  debug(`mount point never found after ${MOUNT_TIMEOUT_MS}ms.`);
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
    debug(`Releasing action lock for ${actionLock.current}`);
    actionLock.current = undefined;
  }

  return {
    async status(): Promise<UsbDriveStatus> {
      if (actionLock.current === 'formatting') {
        debug('Formatting in progress, returning ejected');
        return { status: 'ejected' };
      }

      if (actionLock.current === 'mounting') {
        debug('Mounting in progress, returning no_drive');
        return { status: 'no_drive' };
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
          void mount(deviceInfo, logger).then(releaseActionLock);
        }
        return { status: 'no_drive' };
      }

      if (deviceInfo.mountpoint) {
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

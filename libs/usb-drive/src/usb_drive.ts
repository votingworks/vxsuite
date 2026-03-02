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
import {
  BlockDeviceInfo,
  UsbDriveMonitor,
  createUsbDriveMonitor,
} from './block_devices';

const debug = makeDebug('usb-drive');

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

async function mountUsbDrive(devicePath: string): Promise<void> {
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'mount.sh'), devicePath]);
}

async function unmountUsbDrive(mountPoint: string): Promise<void> {
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'unmount.sh'), mountPoint]);
}

async function formatUsbDrive(
  devicePath: string,
  label: string
): Promise<void> {
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

// Matches partition paths like /dev/sdb1, /dev/sdaa10
const PARTITION_REGEX = /^(\/dev\/sd[a-z]+)\d+$/;
// Matches root disk paths like /dev/sdb, /dev/sdaa
const ROOT_DISK_REGEX = /^\/dev\/sd[a-z]+$/;

function getRootDeviceName(deviceName: string): string {
  // Disk paths (e.g. from unpartitioned drives) are already the root device
  if (ROOT_DISK_REGEX.test(deviceName)) {
    return deviceName;
  }
  const match = deviceName.match(PARTITION_REGEX);
  assert(match, `Unexpected device path: ${deviceName}`);
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
  monitor: UsbDriveMonitor,
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
    await monitor.refresh();
    if (monitor.getDeviceInfo()?.mountpoint) {
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

export function detectUsbDrive(logger: Logger, onRefresh?: () => void): UsbDrive {
  // Mock USB drives for development and integration tests
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return new MockFileUsbDrive();
  }

  // Store eject state so we don't immediately remount the drive on
  // the next status call. We don't need to persist this across restarts, so
  // storing in memory is fine.
  //
  // NOTE: This flag is not keyed by device identity, so with multiple USB
  // drives present, ejecting one drive will suppress auto-mounting of any other
  // drive until the ejected drive is physically removed. Only a single USB drive
  // is supported.
  let didEject = false;

  const actionLock: {
    current?: Action;
  } = { current: undefined };

  const monitor = createUsbDriveMonitor(onRefresh);

  function getActionLock(action: Action): boolean {
    if (actionLock.current) {
      debug(
        `cannot start ${action} while ${actionLock.current} is in progress.`
      );
      return false;
    }
    actionLock.current = action;
    return true;
  }

  function releaseActionLock(): void {
    debug(`releasing action lock for ${actionLock.current}`);
    actionLock.current = undefined;
  }

  return {
    status(): Promise<UsbDriveStatus> {
      if (actionLock.current === 'formatting') {
        debug('formatting in progress, returning ejected');
        return Promise.resolve({ status: 'ejected' });
      }

      if (actionLock.current === 'mounting') {
        debug('mounting in progress, returning no_drive');
        return Promise.resolve({ status: 'no_drive' });
      }

      const deviceInfo = monitor.getDeviceInfo();
      if (!deviceInfo) {
        // Reset eject state in case the drive was removed
        didEject = false;
        return Promise.resolve({ status: 'no_drive' });
      }
      if (!isFat32(deviceInfo)) {
        return Promise.resolve({ status: 'error', reason: 'bad_format' });
      }

      // Automatically mount the drive if it's not already mounted
      if (!deviceInfo.mountpoint && !didEject) {
        if (getActionLock('mounting')) {
          void mount(deviceInfo, monitor, logger).then(releaseActionLock);
        }
        return Promise.resolve({ status: 'no_drive' });
      }

      if (deviceInfo.mountpoint) {
        return Promise.resolve({
          status: 'mounted',
          mountPoint: deviceInfo.mountpoint,
        });
      }
      return Promise.resolve({ status: 'ejected' });
    },

    async eject(): Promise<void> {
      const deviceInfo = monitor.getDeviceInfo();
      if (!deviceInfo?.mountpoint) {
        debug('no USB drive mounted, skipping eject');
        return;
      }

      if (getActionLock('ejecting')) {
        await logEjectInit(logger);
        try {
          debug(`unmounting USB drive at ${deviceInfo.mountpoint}`);
          await unmountUsbDrive(deviceInfo.mountpoint);
          await monitor.refresh();
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
      const deviceInfo = monitor.getDeviceInfo();
      if (!deviceInfo) {
        debug('no USB drive detected, skipping format');
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
          debug(
            `formatting USB drive at ${deviceInfo.path} with label ${label}`
          );
          await formatUsbDrive(getRootDeviceName(deviceInfo.path), label);
          await monitor.refresh();
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
      const deviceInfo = monitor.getDeviceInfo();
      if (!deviceInfo?.mountpoint) {
        debug('No USB drive mounted, skipping sync');
        return;
      }
      await exec('sync', ['-f', deviceInfo.mountpoint]);
    },
  };
}

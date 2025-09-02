import { beforeEach, describe, expect, test, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { deferred } from '@votingworks/basics';
import { backendWaitFor } from '@votingworks/test-utils';
import { join } from 'node:path';
import { LogEventId, LogSource, mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { PromiseWithChild } from 'node:child_process';
import {
  MOUNT_TIMEOUT_MS,
  VX_USB_LABEL_REGEXP,
  detectUsbDrive,
} from './usb_drive';
import { exec } from './exec';
import { UsbDrive } from './types';
import {
  DEFAULT_MOCK_USB_DRIVE_DIR,
  MOCK_USB_DRIVE_STATE_FILENAME,
} from './mocks/file_usb_drive';
import { BlockDeviceInfo, getUsbDriveDeviceInfo } from './block_devices';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

const execMock = vi.mocked(exec);
const getUsbDriveDeviceInfoMock = vi.mocked(getUsbDriveDeviceInfo);

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    exec: vi.fn().mockRejectedValue(new Error('exec not mocked')),
  })
);

const featureFlagMock = getFeatureFlagMock();

vi.mock(
  import('@votingworks/utils'),
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual()),
    isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
  })
);

vi.mock('./block_devices', async (importActual) => ({
  ...(await importActual()),
  getUsbDriveDeviceInfo: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function mockBlockDeviceInfo(
  blockDeviceInfo: Partial<BlockDeviceInfo> = {}
): BlockDeviceInfo {
  return {
    name: 'sdb1',
    path: '/dev/sdb1',
    mountpoint: '/media/usb-drive-sdb1',
    fstype: 'vfat',
    fsver: 'FAT32',
    label: 'VxUSB-00000',
    type: 'part',
    ...blockDeviceInfo,
  };
}

/**
 * Used to confirm that the `usbDrive` is not left with an unreleased lock.
 * Triggers a mount and, by confirming that mount is called, confirms the lock
 * was released.
 */
async function confirmLockReleased(usbDrive: UsbDrive) {
  // confirm that no lock is held on the drive status and it freely changes

  // reset to no drive
  getUsbDriveDeviceInfoMock.mockResolvedValue(undefined);
  await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

  // confirm we detect a mounted drive
  getUsbDriveDeviceInfoMock.mockResolvedValue(
    mockBlockDeviceInfo({
      mountpoint: '/media/vx/usb-drive',
      path: '/dev/lock-check',
    })
  );
  await expect(usbDrive.status()).resolves.toEqual({
    status: 'mounted',
    mountPoint: '/media/vx/usb-drive',
  });
}

describe('status', () => {
  test('no drive', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(undefined);

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });
  });

  test('one drive, mounted', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/usb-drive-sdb1',
    });
  });

  test('one drive, unmounted', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    // device is initially unmounted, then mounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: '/media/vx/usb-drive' })
    );

    // mock mount script
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    // first call triggers the mount and returns no_drive
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // second call returns mounted
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/vx/usb-drive',
    });

    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(1, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/mount.sh`,
      '/dev/sdb1',
    ]);

    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.UsbDriveMountInit,
      'system'
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.UsbDriveMounted,
      'system',
      expect.objectContaining({ disposition: 'success' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('bad format', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({
        fstype: 'exfat',
      })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });

    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({
        fstype: 'EXFAT',
      })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });
  });

  test('fails to mount', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );

    // mock mount script failing
    execMock.mockRejectedValueOnce(new Error('Failed'));

    // first call triggers the mount and returns no_drive
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // second call is still no_drive because the mount failed
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // check logging
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveMounted,
      'system',
      expect.objectContaining({ disposition: 'failure' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('if mount succeeds but mount point is not found, release lock', async () => {
    vi.useFakeTimers();
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    // mock an unmounted drive that is not found after mounting
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(undefined);

    // mock mount script
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    // first call triggers the mount and returns no_drive
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // status locked to no_drive while waiting for mount point
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });
    await expect(confirmLockReleased(usbDrive)).rejects.toThrow();

    // after timeout, lock is released
    await vi.advanceTimersByTimeAsync(MOUNT_TIMEOUT_MS);
    await confirmLockReleased(usbDrive);

    vi.useRealTimers();
  });

  test('if mount point is found after timeout, we still "mount" it by detecting the mount point belatedly', async () => {
    vi.useFakeTimers();
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    // first call triggers the mount that times out
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });
    await vi.advanceTimersByTimeAsync(MOUNT_TIMEOUT_MS);

    // subsequent calls, while lsblk is still showing no point point, will
    // just fail another mount attempt
    execMock.mockRejectedValueOnce(new Error('already mounted'));
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    // once it appears, we return the mounted drive
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: '/media/vx/usb-drive' })
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/vx/usb-drive',
    });

    expect(vi.mocked(exec)).toHaveBeenCalledTimes(2);
    await confirmLockReleased(usbDrive);
    vi.useRealTimers();
  });
});

describe('eject', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValue(undefined);

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('not mounted - no op', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: null })
    );

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('mounted', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'election_manager',
      fn: vi.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is mounted, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: undefined })
    );

    // mock unmount script
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await expect(usbDrive.eject()).resolves.toBeUndefined();
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(1, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);

    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.UsbDriveEjectInit,
      'election_manager'
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.UsbDriveEjected,
      'election_manager',
      expect.objectContaining({ disposition: 'success' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('fails to eject', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'election_manager',
      fn: vi.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );

    // mock unmount script failing
    execMock.mockRejectedValueOnce(new Error('Failed'));

    await expect(usbDrive.eject()).rejects.toThrowError(new Error('Failed'));

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      'election_manager',
      expect.objectContaining({ disposition: 'failure' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('no-op if already ejecting', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );
    const { promise: ejectScriptPromise, resolve: ejectScriptResolve } =
      deferred<{
        stdout: string;
        stderr: string;
      }>();
    execMock.mockReturnValueOnce(
      ejectScriptPromise as PromiseWithChild<{
        stdout: string;
        stderr: string;
      }>
    ); // mock eject script

    const ejectPromise = usbDrive.eject();

    // can call eject again, which will be a no-op and resolve because the
    // first eject is still running
    await usbDrive.eject(); // no-op

    ejectScriptResolve({ stdout: '', stderr: '' });
    await ejectPromise;

    await confirmLockReleased(usbDrive);
  });
});

describe('format', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(undefined);

    await expect(usbDrive.format()).resolves.toBeUndefined();
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
  });

  test('on mounted, previously formatted drive', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'system_administrator',
      fn: vi.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is mounted, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // mock unmount script
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // mock format script

    // format should call unmount and format scripts
    await usbDrive.format();
    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(1, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);
    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_fat32.sh`,
      '/dev/sdb',
      'VxUSB-00000',
    ]);

    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    expect(logger.log).toHaveBeenNthCalledWith(
      1,
      LogEventId.UsbDriveFormatInit,
      'system_administrator'
    );
    expect(logger.log).toHaveBeenNthCalledWith(
      2,
      LogEventId.UsbDriveFormatted,
      'system_administrator',
      expect.objectContaining({ disposition: 'success' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('on bad format drive', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is bad format, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ fstype: 'exfat', mountpoint: null, label: 'DATA' })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // mock format script

    // format should call format script only
    await usbDrive.format();
    expect(vi.mocked(exec)).toHaveBeenNthCalledWith(1, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_fat32.sh`,
      '/dev/sdb',
      expect.stringMatching(VX_USB_LABEL_REGEXP),
    ]);

    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });
  });

  test('on format failure', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'system_administrator',
      fn: vi.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is unknown format, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ fstype: 'unknown', mountpoint: null, label: null })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    execMock.mockRejectedValueOnce(new Error('Command: failed')); // mock format script

    await expect(usbDrive.format()).rejects.toThrow('Command: failed');

    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('status polling while formatting', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is mounted, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // mock unmount script
    const { promise: formatScriptPromise, resolve: formatScriptResolve } =
      deferred<{
        stdout: string;
        stderr: string;
      }>();
    execMock.mockReturnValueOnce(
      formatScriptPromise as PromiseWithChild<{
        stdout: string;
        stderr: string;
      }>
    ); // mock format script

    const formatPromise = usbDrive.format();

    // status is locked to ejected while waiting for format to complete
    await backendWaitFor(async () => {
      expect(await usbDrive.status()).toEqual({ status: 'ejected' });
    });

    formatScriptResolve({ stdout: '', stderr: '' });
    await formatPromise;

    expect(await usbDrive.status()).toEqual({ status: 'ejected' });

    await confirmLockReleased(usbDrive);
  });

  test('no-op if already formatting', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    // mock drive that is bad format, then unmounted
    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ fstype: 'exfat', mountpoint: null, label: 'DATA' })
    );
    getUsbDriveDeviceInfoMock.mockResolvedValue(
      mockBlockDeviceInfo({ mountpoint: null })
    );
    const { promise: formatScriptPromise, resolve: formatScriptResolve } =
      deferred<{
        stdout: string;
        stderr: string;
      }>();
    execMock.mockReturnValueOnce(
      formatScriptPromise as PromiseWithChild<{
        stdout: string;
        stderr: string;
      }>
    ); // mock format script

    const formatPromise = usbDrive.format();

    // can call format again, which will be a no-op and resolve because the
    // first format is still running
    await usbDrive.format(); // no-op

    formatScriptResolve({ stdout: '', stderr: '' });
    await formatPromise;

    await confirmLockReleased(usbDrive);
  });
});

describe('sync', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(undefined);

    await expect(usbDrive.sync()).resolves.toBeUndefined();
    expect(vi.mocked(exec)).not.toHaveBeenCalled();
  });

  test('when mounted, execs sync', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const usbDrive = detectUsbDrive(logger);

    getUsbDriveDeviceInfoMock.mockResolvedValueOnce(
      mockBlockDeviceInfo({ mountpoint: '/media/usb-drive-sdb1' })
    );
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // mock sync script

    await usbDrive.sync();

    expect(vi.mocked(exec)).toHaveBeenLastCalledWith('sync', [
      '-f',
      '/media/usb-drive-sdb1',
    ]);
  });
});

test('uses mock file usb drive if environment variable is set', async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const stateFilePath = join(
    DEFAULT_MOCK_USB_DRIVE_DIR,
    MOCK_USB_DRIVE_STATE_FILENAME
  );

  // Ensure we start with no mock state file
  if (existsSync(stateFilePath)) {
    rmSync(stateFilePath);
  }
  expect(existsSync(stateFilePath)).toEqual(false);

  const usbDrive = detectUsbDrive(mockLogger({ fn: vi.fn }));
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  expect(existsSync(stateFilePath)).toEqual(true);
});

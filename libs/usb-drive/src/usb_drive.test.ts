import { promises as fs, existsSync, rmSync } from 'node:fs';
import { deferred } from '@votingworks/basics';
import { backendWaitFor } from '@votingworks/test-utils';
import { join } from 'node:path';
import { LogEventId, LogSource, mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  BlockDeviceInfo,
  VX_USB_LABEL_REGEXP,
  detectUsbDrive,
} from './usb_drive';
import { exec } from './exec';
import { UsbDrive, UsbDriveStatus } from './types';
import {
  DEFAULT_MOCK_USB_DRIVE_DIR,
  MOCK_USB_DRIVE_STATE_FILENAME,
} from './mocks/file_usb_drive';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  promises: {
    readdir: jest.fn().mockRejectedValue(new Error('Not mocked')),
    readlink: jest.fn().mockRejectedValue(new Error('Not mocked')),
  },
}));
jest.mock('./exec', () => ({
  exec: jest.fn().mockRejectedValue(new Error('Not mocked')),
}));

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const readdirMock = fs.readdir as unknown as jest.Mock<Promise<string[]>>;
const readlinkMock = fs.readlink as unknown as jest.Mock<Promise<string>>;
const execMock = exec as unknown as jest.Mock<Promise<{ stdout: string }>>;

afterEach(() => {
  jest.resetAllMocks();
});

function lsblkOutput(devices: Array<Partial<BlockDeviceInfo>> = []) {
  return {
    stdout: JSON.stringify({
      blockdevices: devices.map((device) => ({
        name: 'sdb1',
        mountpoint: '/media/usb-drive-sdb1',
        fstype: 'vfat',
        fsver: 'FAT32',
        label: 'VxUSB-00000',
        type: 'part',
        ...device,
      })),
    }),
  };
}

function mockBlockDeviceOnce(device: Partial<BlockDeviceInfo> = {}): void {
  readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
  readlinkMock.mockResolvedValueOnce('../../sdb1');
  execMock.mockResolvedValueOnce(lsblkOutput([device]));
}

/**
 * Used to confirm that the `usbDrive` is not left with an unreleased lock.
 * Triggers a mount and, by confirming that mount is called, confirms the lock
 * was released.
 */
async function confirmLockReleased(usbDrive: UsbDrive) {
  // reset to no drive
  readdirMock.mockResolvedValueOnce([]);
  await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

  // insert a drive that should be mounted
  mockBlockDeviceOnce({ mountpoint: null, name: 'confirm-mount' });
  execMock.mockResolvedValueOnce({ stdout: '' });
  await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });
  await backendWaitFor(() => {
    expect(execMock).toHaveBeenLastCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/mount.sh`,
      '/dev/confirm-mount',
    ]);
  }); // mount script was called, so action state was not locked

  // reset action state by completing mount via status check
  mockBlockDeviceOnce({ mountpoint: '/media/vx/usb-drive' });
  await expect(usbDrive.status()).resolves.toEqual({
    status: 'mounted',
    mountPoint: '/media/vx/usb-drive',
  });
}

describe('status', () => {
  test('no drive', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'election_manager',
      fn: jest.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    expect(readdirMock).toHaveBeenCalledWith('/dev/disk/by-id/');
  });

  test('completely ignores invalid devices', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          fstype: 'LVM2',
        },
      ])
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          type: 'lvm',
        },
      ])
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          fstype: null,
          mountpoint: '/',
        },
      ])
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });
  });

  test('one drive, mounted', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([{ mountpoint: '/media/usb-drive-sdb1' }])
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/usb-drive-sdb1',
    });

    expect(readdirMock).toHaveBeenCalledWith('/dev/disk/by-id/');
    expect(readlinkMock).toHaveBeenCalledWith(
      '/dev/disk/by-id/usb-foobar-part23'
    );
    expect(execMock).toHaveBeenCalledWith('lsblk', [
      '-J',
      '-n',
      '-l',
      '-o',
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL', 'TYPE'].join(','),
      '/dev/sdb1',
    ]);
  });

  test('one drive, unmounted', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    // Initial status
    execMock.mockResolvedValueOnce(lsblkOutput([{ mountpoint: null }]));
    // Mount
    execMock.mockResolvedValueOnce({ stdout: '' });

    // While mounting, status is 'no_drive'
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // Status after mount
    execMock.mockResolvedValueOnce(
      lsblkOutput([{ mountpoint: '/media/vx/usb-drive' }])
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/vx/usb-drive',
    });

    expect(execMock).toHaveBeenNthCalledWith(1, 'lsblk', [
      '-J',
      '-n',
      '-l',
      '-o',
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL', 'TYPE'].join(','),
      '/dev/sdb1',
    ]);
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/mount.sh`,
      '/dev/sdb1',
    ]);
    expect(execMock).toHaveBeenNthCalledWith(3, 'lsblk', [
      '-J',
      '-n',
      '-l',
      '-o',
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL', 'TYPE'].join(','),
      '/dev/sdb1',
    ]);

    // check logging
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

  test('multiple usb devices - selects first valid', async () => {
    const testCases: Array<{
      sdb1: Partial<BlockDeviceInfo>;
      sdc1: Partial<BlockDeviceInfo>;
      expectedStatus: UsbDriveStatus;
      newMountPoint?: string;
    }> = [
      {
        sdb1: { mountpoint: '/media/usb-drive-sdb1' },
        sdc1: { mountpoint: '/media/usb-drive-sdc1' },
        expectedStatus: {
          status: 'mounted',
          mountPoint: '/media/usb-drive-sdb1',
        },
      },
      {
        sdb1: { mountpoint: undefined },
        sdc1: { mountpoint: '/media/usb-drive-sdc1' },
        expectedStatus: { status: 'no_drive' },
        newMountPoint: '/dev/sdb1',
      },
      {
        sdb1: { mountpoint: '/' },
        sdc1: { mountpoint: '/media/usb-drive-sdc1' },
        expectedStatus: {
          status: 'mounted',
          mountPoint: '/media/usb-drive-sdc1',
        },
      },
      {
        sdb1: { mountpoint: '/' },
        sdc1: { mountpoint: undefined },
        expectedStatus: { status: 'no_drive' },
        newMountPoint: '/dev/sdc1',
      },
    ];

    for (const testCase of testCases) {
      const logger = mockLogger({ fn: jest.fn });
      const usbDrive = detectUsbDrive(logger);
      readdirMock.mockResolvedValue([
        'notausb-bazbar-part21', // this device should be ignored
        'usb-foobar-part23',
        'usb-babar-part3',
      ]);
      readlinkMock.mockResolvedValueOnce('../../sdb1');
      readlinkMock.mockResolvedValueOnce('../../sdc1');
      execMock.mockResolvedValueOnce(
        lsblkOutput([
          { ...testCase.sdb1, name: 'sdb1' },
          { ...testCase.sdc1, name: 'sdc1' },
        ])
      );
      await expect(usbDrive.status()).resolves.toEqual(testCase.expectedStatus);

      if (testCase.newMountPoint) {
        await backendWaitFor(() => {
          expect(execMock).toHaveBeenLastCalledWith('sudo', [
            '-n',
            `${MOUNT_SCRIPT_PATH}/mount.sh`,
            testCase.newMountPoint,
          ]);
        });
      }
    }
  });

  test('error getting block device info', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockRejectedValue(new Error('Failed to get block device info'));

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });
  });

  test('bad format', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          fstype: 'exfat',
        },
      ])
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });

    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          fsver: 'EXFAT',
        },
      ])
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });
  });

  test('fails to mount', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    // Initial status
    execMock.mockResolvedValueOnce(lsblkOutput([{ mountpoint: null }]));
    // Mount
    execMock.mockRejectedValueOnce(new Error('Failed'));

    // While mounting, status is 'no_drive'
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // check logging
    await backendWaitFor(() => {
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveMounted,
        'system',
        expect.objectContaining({ disposition: 'failure' })
      );
    });

    await confirmLockReleased(usbDrive);
  });
});

describe('eject', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('not mounted - no op', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: null });

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('mounted', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'election_manager',
      fn: jest.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });

    // Unmount
    execMock.mockResolvedValueOnce({ stdout: '' });

    await expect(usbDrive.eject()).resolves.toBeUndefined();

    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);

    mockBlockDeviceOnce({ mountpoint: null });

    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    // check logging
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
      fn: jest.fn,
    });
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });

    // Unmount
    execMock.mockRejectedValueOnce(new Error('Failed'));

    await expect(usbDrive.eject()).rejects.toThrowError(new Error('Failed'));

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      'election_manager',
      expect.objectContaining({ disposition: 'failure' })
    );

    await confirmLockReleased(usbDrive);
  });
});

describe('format', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);
    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.format()).resolves.toBeUndefined();
    expect(execMock).not.toHaveBeenCalled();
  });

  test('on mounted, previously formatted drive', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'system_administrator',
      fn: jest.fn,
    });
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // unmount
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call unmount and format scripts
    await usbDrive.format();
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);
    expect(execMock).toHaveBeenNthCalledWith(3, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_fat32.sh`,
      '/dev/sdb',
      'VxUSB-00000',
    ]);

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    // check logging
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
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ fstype: 'exfat', mountpoint: null, label: 'DATA' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call format script only
    await usbDrive.format();
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_fat32.sh`,
      '/dev/sdb',
      expect.stringMatching(VX_USB_LABEL_REGEXP),
    ]);

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });
  });

  test('on format failure', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'system_administrator',
      fn: jest.fn,
    });
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ fstype: 'unknown', mountpoint: null, label: null });
    execMock.mockRejectedValueOnce(new Error('Command: failed')); // format

    // format should call format script only
    await expect(usbDrive.format()).rejects.toThrow('Command: failed');

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    // check logging
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );

    await confirmLockReleased(usbDrive);
  });

  test('status polling while formatting', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // unmount
    const { promise: formatScriptPromise, resolve: formatScriptResolve } =
      deferred<{
        stdout: string;
      }>();
    execMock.mockReturnValueOnce(formatScriptPromise); // format

    const formatPromise = usbDrive.format();

    await backendWaitFor(async () => {
      expect(await usbDrive.status()).toEqual({ status: 'ejected' });
    });

    formatScriptResolve({ stdout: '' });
    await formatPromise;

    mockBlockDeviceOnce({ mountpoint: null });
    expect(await usbDrive.status()).toEqual({ status: 'ejected' });
  });
});

describe('sync', () => {
  test('no drive - no op', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);
    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.sync()).resolves.toBeUndefined();
    expect(execMock).not.toHaveBeenCalled();
  });

  test('when mounted, execs sync', async () => {
    const logger = mockLogger({ fn: jest.fn });
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // sync

    await usbDrive.sync();

    expect(execMock).toHaveBeenCalledTimes(2); // status, sync
    expect(execMock).toHaveBeenLastCalledWith('sync', [
      '-f',
      '/media/usb-drive-sdb1',
    ]);
  });
});

test('action locking', async () => {
  const logger = mockLogger({ fn: jest.fn });
  const usbDrive = detectUsbDrive(logger);

  mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
  const { promise: unmountPromise, resolve: unmountResolve } = deferred<{
    stdout: string;
  }>();
  execMock.mockReturnValueOnce(unmountPromise);

  const ejectPromise = usbDrive.eject();

  await backendWaitFor(() => {
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);
  });

  mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
  await usbDrive.format();

  unmountResolve({ stdout: '' });
  await ejectPromise;

  expect(execMock).toHaveBeenCalledTimes(3); // 1 status, 2 unmount, 3 status, no format
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

  const usbDrive = detectUsbDrive(mockLogger({ fn: jest.fn }));
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  expect(existsSync(stateFilePath)).toEqual(true);
});

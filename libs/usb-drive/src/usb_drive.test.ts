import { promises as fs } from 'fs';
import { deferred } from '@votingworks/basics';
import { backendWaitFor } from '@votingworks/test-utils';
import { join } from 'path';
import { LogEventId, fakeLogger } from '@votingworks/logging';
import {
  BlockDeviceInfo,
  UsbDriveStatus,
  VX_USB_LABEL_REGEXP,
  detectUsbDrive,
} from './usb_drive';
import { exec } from './exec';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn().mockRejectedValue(new Error('Not mocked')),
    readlink: jest.fn().mockRejectedValue(new Error('Not mocked')),
  },
}));
jest.mock('./exec', () => ({
  exec: jest.fn().mockRejectedValue(new Error('Not mocked')),
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
        ...device,
      })),
    }),
  };
}

describe('status', () => {
  test('no drive', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    expect(readdirMock).toHaveBeenCalledWith('/dev/disk/by-id/');
  });

  test('one drive, mounted', async () => {
    const logger = fakeLogger();
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
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL'].join(','),
      '/dev/sdb1',
    ]);
  });

  test('one drive, unmounted', async () => {
    const logger = fakeLogger();
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
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL'].join(','),
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
      ['NAME', 'MOUNTPOINT', 'FSTYPE', 'FSVER', 'LABEL'].join(','),
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
      const logger = fakeLogger();
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
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockRejectedValue(new Error('Failed to get block device info'));

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });
  });

  test('bad format', async () => {
    const logger = fakeLogger();
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
    const logger = fakeLogger();
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
  });
});

function mockBlockDeviceOnce(device: Partial<BlockDeviceInfo> = {}): void {
  readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
  readlinkMock.mockResolvedValueOnce('../../sdb1');
  execMock.mockResolvedValueOnce(lsblkOutput([device]));
}

describe('eject', () => {
  test('no drive - no op', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.eject('election_manager')).resolves.toBeUndefined();
  });

  test('not mounted - no op', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: null });

    await expect(usbDrive.eject('election_manager')).resolves.toBeUndefined();
  });

  test('mounted', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });

    // Unmount
    execMock.mockResolvedValueOnce({ stdout: '' });

    await expect(usbDrive.eject('election_manager')).resolves.toBeUndefined();

    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);

    mockBlockDeviceOnce({ mountpoint: null });

    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    // Remove USB and reinsert, should be detected and mounted again
    readdirMock.mockResolvedValueOnce([]);
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });
    mockBlockDeviceOnce({ mountpoint: null });
    execMock.mockResolvedValueOnce({ stdout: '' });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });
    mockBlockDeviceOnce({ mountpoint: '/media/vx/usb-drive' });
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/vx/usb-drive',
    });

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
  });

  test('fails to eject', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);

    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });

    // Unmount
    execMock.mockRejectedValueOnce(new Error('Failed'));

    await expect(usbDrive.eject('election_manager')).rejects.toThrowError(
      new Error('Failed')
    );

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      'election_manager',
      expect.objectContaining({ disposition: 'failure' })
    );
  });
});

describe('format', () => {
  test('no drive - no op', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);
    readdirMock.mockResolvedValueOnce([]);

    await expect(
      usbDrive.format('system_administrator')
    ).resolves.toBeUndefined();
    expect(execMock).not.toHaveBeenCalled();
  });

  test('on mounted, previously formatted drive', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // unmount
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call unmount and format scripts
    await usbDrive.format('system_administrator');
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
  });

  test('on bad format drive', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ fstype: 'exfat', mountpoint: null, label: 'DATA' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call format script only
    await usbDrive.format('system_administrator');
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
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ fstype: 'unknown', mountpoint: null, label: null });
    execMock.mockRejectedValueOnce(new Error('Command: failed')); // format

    // format should call format script only
    await expect(usbDrive.format('system_administrator')).rejects.toThrow(
      'Command: failed'
    );

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });

    // check logging
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      'system_administrator',
      expect.objectContaining({ disposition: 'failure' })
    );
  });

  test('status polling while formatting', async () => {
    const logger = fakeLogger();
    const usbDrive = detectUsbDrive(logger);
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // unmount
    const { promise: formatScriptPromise, resolve: formatScriptResolve } =
      deferred<{
        stdout: string;
      }>();
    execMock.mockReturnValueOnce(formatScriptPromise); // format

    const formatPromise = usbDrive.format('system_administrator');

    await backendWaitFor(async () => {
      expect(await usbDrive.status()).toEqual({ status: 'ejected' });
    });

    formatScriptResolve({ stdout: '' });
    await formatPromise;

    mockBlockDeviceOnce({ mountpoint: null });
    expect(await usbDrive.status()).toEqual({ status: 'ejected' });
  });
});

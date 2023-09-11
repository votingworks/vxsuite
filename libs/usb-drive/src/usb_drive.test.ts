import { promises as fs } from 'fs';
import { deferred } from '@votingworks/basics';
import { backendWaitFor } from '@votingworks/test-utils';
import {
  BlockDeviceInfo,
  VX_USB_LABEL_REGEXP,
  detectUsbDrive,
} from './usb_drive';
import { exec } from './exec';

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

function lsblkOutput(device: Partial<BlockDeviceInfo> = {}) {
  return {
    stdout: JSON.stringify({
      blockdevices: [
        {
          name: 'sdb1',
          mountpoint: '/media/usb-drive-sdb1',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-00000',
          ...device,
        },
      ],
    }),
  };
}

describe('status', () => {
  test('no drive', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });

    expect(readdirMock).toHaveBeenCalledWith('/dev/disk/by-id/');
  });

  test('one drive, mounted', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput({ mountpoint: '/media/usb-drive-sdb1' })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/usb-drive-sdb1',
      deviceName: 'sdb1',
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
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    // Initial status
    execMock.mockResolvedValueOnce(lsblkOutput({ mountpoint: null }));
    // Mount
    execMock.mockResolvedValueOnce({ stdout: '' });

    // While mounting, status is 'no_drive'
    await expect(usbDrive.status()).resolves.toEqual({ status: 'no_drive' });

    // Status after mount
    execMock.mockResolvedValueOnce(
      lsblkOutput({ mountpoint: '/media/vx/usb-drive' })
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/vx/usb-drive',
      deviceName: 'sdb1',
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
      `${__dirname}/mount.sh`,
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
  });

  test('multiple usb devices', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValue([
      'notausb-bazbar-part21', // Should be ignored
      'usb-foobar-part23', // Should take the first matching USB drive
      'usb-babar-part3',
    ]);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput({ mountpoint: '/media/usb-drive-sdb1' })
    );
    await expect(usbDrive.status()).resolves.toEqual({
      status: 'mounted',
      mountPoint: '/media/usb-drive-sdb1',
      deviceName: 'sdb1',
    });
  });

  test('error getting block device info', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockRejectedValue(new Error('Failed to get block device info'));

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'no_drive',
    });
  });

  test('bad format', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValue(['usb-foobar-part23']);
    readlinkMock.mockResolvedValue('../../sdb1');
    execMock.mockResolvedValueOnce(
      lsblkOutput({
        fstype: 'exfat',
      })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });

    execMock.mockResolvedValueOnce(
      lsblkOutput({
        fsver: 'EXFAT',
      })
    );

    await expect(usbDrive.status()).resolves.toEqual({
      status: 'error',
      reason: 'bad_format',
    });
  });
});

function mockBlockDeviceOnce(device: Partial<BlockDeviceInfo> = {}): void {
  readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
  readlinkMock.mockResolvedValueOnce('../../sdb1');
  execMock.mockResolvedValueOnce(lsblkOutput(device));
}

describe('eject', () => {
  test('no drive - no op', async () => {
    const usbDrive = detectUsbDrive();

    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('not mounted - no op', async () => {
    const usbDrive = detectUsbDrive();

    mockBlockDeviceOnce({ mountpoint: null });

    await expect(usbDrive.eject()).resolves.toBeUndefined();
  });

  test('mounted', async () => {
    const usbDrive = detectUsbDrive();

    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });

    // Unmount
    execMock.mockResolvedValueOnce({ stdout: '' });

    await expect(usbDrive.eject()).resolves.toBeUndefined();

    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${__dirname}/unmount.sh`,
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
      deviceName: 'sdb1',
    });
  });
});

describe('format', () => {
  test('no drive - no op', async () => {
    const usbDrive = detectUsbDrive();
    readdirMock.mockResolvedValueOnce([]);

    await expect(usbDrive.format()).resolves.toBeUndefined();
    expect(execMock).not.toHaveBeenCalled();
  });

  test('on mounted, previously formatted drive', async () => {
    const usbDrive = detectUsbDrive();
    mockBlockDeviceOnce({ mountpoint: '/media/usb-drive-sdb1' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // unmount
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call unmount and format scripts
    await usbDrive.format();
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${__dirname}/unmount.sh`,
      '/media/usb-drive-sdb1',
    ]);
    expect(execMock).toHaveBeenNthCalledWith(3, 'sudo', [
      '-n',
      `${__dirname}/format_fat32.sh`,
      '/dev/sdb',
      'VxUSB-00000',
    ]);

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });
  });

  test('on bad format drive', async () => {
    const usbDrive = detectUsbDrive();
    mockBlockDeviceOnce({ fstype: 'exfat', mountpoint: null, label: 'DATA' });
    execMock.mockResolvedValueOnce({ stdout: '' }); // format

    // format should call format script only
    await usbDrive.format();
    expect(execMock).toHaveBeenNthCalledWith(2, 'sudo', [
      '-n',
      `${__dirname}/format_fat32.sh`,
      '/dev/sdb',
      expect.stringMatching(VX_USB_LABEL_REGEXP),
    ]);

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });
  });

  test('on format failure', async () => {
    const usbDrive = detectUsbDrive();
    mockBlockDeviceOnce({ fstype: 'unknown', mountpoint: null, label: null });
    execMock.mockRejectedValueOnce(new Error('Command: failed')); // format

    // format should call format script only
    await expect(usbDrive.format()).rejects.toThrow('Command: failed');

    // status should be ejected
    mockBlockDeviceOnce({ mountpoint: null });
    await expect(usbDrive.status()).resolves.toEqual({ status: 'ejected' });
  });

  test('status polling while formatting', async () => {
    const usbDrive = detectUsbDrive();
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

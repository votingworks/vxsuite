import { beforeEach, describe, expect, test, vi } from 'vitest';
import { promises as fs, PathLike } from 'node:fs';
import { BlockDeviceInfo, getUsbDriveDeviceInfo } from './block_devices';
import { exec } from './exec';

const readdirMock = vi.mocked<(path: PathLike) => Promise<string[]>>(
  fs.readdir
);
const readlinkMock = vi.mocked(fs.readlink);
const execMock = vi.mocked(exec);

vi.mock(
  import('node:fs'),
  async (importActual): Promise<typeof import('node:fs')> => {
    const actual = await importActual();
    return {
      ...actual,
      promises: {
        ...actual.promises,
        readdir: vi.fn().mockRejectedValue(new Error('readdir not mocked')),
        readlink: vi.fn().mockRejectedValue(new Error('readlink not mocked')),
      },
    };
  }
);

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    exec: vi.fn().mockRejectedValue(new Error('exec not mocked')),
  })
);

beforeEach(() => {
  vi.clearAllMocks();
});

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function lsblkOutput(devices: Array<Partial<BlockDeviceInfo>> = []) {
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
    stderr: '',
  };
}

export function mockBlockDeviceOnce(
  device: Partial<BlockDeviceInfo> = {}
): void {
  readdirMock.mockResolvedValueOnce(['usb-foobar-part23']);
  readlinkMock.mockResolvedValueOnce('../../sdb1');
  execMock.mockResolvedValueOnce(lsblkOutput([device]));
}

describe('getUsbDriveDeviceInfo', () => {
  test('returns undefined when no USB devices found', async () => {
    readdirMock.mockResolvedValueOnce([]);

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when no appropriately named USB partitions found', async () => {
    readdirMock.mockResolvedValueOnce(['usb-other1', 'sata-drive-part1']);

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when lsblk fails', async () => {
    readdirMock.mockResolvedValueOnce(['usb-device-part1']);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    execMock.mockRejectedValueOnce(new Error('lsblk failed'));

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when no partition type block devices found', async () => {
    mockBlockDeviceOnce({
      type: 'disk', // rather than 'part'
    });

    const result = await getUsbDriveDeviceInfo();
    expect(result).toBeUndefined();
  });

  test('returns undefined when partition is acting as an LVM', async () => {
    mockBlockDeviceOnce({
      fstype: 'LVM2_member',
      type: 'part',
    });

    const result = await getUsbDriveDeviceInfo();
    expect(result).toBeUndefined();
  });

  test('returns undefined when found drive is mounted outside /media', async () => {
    mockBlockDeviceOnce({
      mountpoint: '/home/user/mount',
      type: 'part',
      fstype: 'vfat',
    });

    const result = await getUsbDriveDeviceInfo();

    expect(result).toBeUndefined();
  });

  test('returns device info for USB drive', async () => {
    mockBlockDeviceOnce({
      name: 'sdb1',
      mountpoint: '/media/usb-drive-sdb1',
      fstype: 'vfat',
      fsver: 'FAT32',
      label: 'VxUSB-12345',
      type: 'part',
    });

    const result = await getUsbDriveDeviceInfo();

    expect(result).toEqual({
      name: 'sdb1',
      path: '/dev/sdb1',
      mountpoint: '/media/usb-drive-sdb1',
      fstype: 'vfat',
      fsver: 'FAT32',
      label: 'VxUSB-12345',
      type: 'part',
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
      'NAME,MOUNTPOINT,FSTYPE,FSVER,LABEL,TYPE',
      '/dev/sdb1',
    ]);
  });

  test('handles multiple USB devices and selects first valid data drive', async () => {
    readdirMock.mockResolvedValueOnce([
      'usb-device1-part1',
      'usb-device2-part1',
      'not-usb-device',
    ]);
    readlinkMock.mockResolvedValueOnce('../../sdb1');
    readlinkMock.mockResolvedValueOnce('../../sdc1');
    execMock.mockResolvedValueOnce(
      lsblkOutput([
        {
          name: 'sdb1',
          type: 'disk', // not a valid data drive
        },
        {
          name: 'sdc1',
          mountpoint: '/media/usb-drive-sdc1',
          type: 'part',
          fstype: 'vfat',
        },
      ])
    );

    const result = await getUsbDriveDeviceInfo();

    expect(result).toEqual({
      name: 'sdc1',
      path: '/dev/sdc1',
      mountpoint: '/media/usb-drive-sdc1',
      fstype: 'vfat',
      fsver: 'FAT32',
      label: 'VxUSB-00000',
      type: 'part',
    });
  });
});

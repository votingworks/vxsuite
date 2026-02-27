import { beforeEach, describe, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { BlockDeviceInfo, getUsbDriveDeviceInfo } from './block_devices';
import { exec } from './exec';

const readFileMock = vi.mocked(fs.readFile);
const execMock = vi.mocked(exec);

vi.mock(
  import('node:fs'),
  async (importActual): Promise<typeof import('node:fs')> => {
    const actual = await importActual();
    return {
      ...actual,
      promises: {
        ...actual.promises,
        readFile: vi.fn().mockRejectedValue(new Error('readFile not mocked')),
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

function exportDbEntry(info: {
  devname: string;
  devtype?: 'disk' | 'partition';
  idBus?: string;
  fstype?: string | null;
  fsver?: string | null;
  label?: string | null;
}): string {
  const {
    devname,
    devtype = 'partition',
    idBus = 'usb',
    fstype,
    fsver,
    label,
  } = info;
  const lines = [
    `E: DEVNAME=${devname}`,
    `E: SUBSYSTEM=block`,
    `E: DEVTYPE=${devtype}`,
    `E: ID_BUS=${idBus}`,
  ];
  if (fstype) lines.push(`E: ID_FS_TYPE=${fstype}`);
  if (fsver) lines.push(`E: ID_FS_VERSION=${fsver}`);
  if (label) lines.push(`E: ID_FS_LABEL=${label}`);
  return lines.join('\n');
}

function exportDbOutput(devices: Array<Parameters<typeof exportDbEntry>[0]>) {
  return { stdout: devices.map(exportDbEntry).join('\n\n'), stderr: '' };
}

function procMountsContent(
  mounts: Array<{ device: string; mountpoint: string }> = []
): string {
  return mounts
    .map(({ device, mountpoint }) => `${device} ${mountpoint} vfat rw 0 0`)
    .join('\n');
}

function mockBlockDeviceOnce(device: Partial<BlockDeviceInfo> = {}): void {
  const {
    name = 'sdb1',
    mountpoint = '/media/usb-drive-sdb1',
    path = `/dev/${name}`,
    type = 'part',
    fstype = 'vfat',
    fsver = 'FAT32',
    label = 'VxUSB-00000',
  } = device;
  execMock.mockResolvedValueOnce(
    exportDbOutput([
      {
        devname: path,
        devtype: type === 'part' ? 'partition' : 'disk',
        fstype,
        fsver,
        label,
      },
    ])
  );
  readFileMock.mockResolvedValueOnce(
    mountpoint
      ? procMountsContent([{ device: path, mountpoint }])
      : procMountsContent()
  );
}

describe('getUsbDriveDeviceInfo', () => {
  test('returns undefined when no USB block devices found', async () => {
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when udevadm fails', async () => {
    execMock.mockRejectedValueOnce(new Error('udevadm failed'));
    readFileMock.mockResolvedValueOnce('');

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('treats drive as unmounted when /proc/mounts is unreadable', async () => {
    execMock.mockResolvedValueOnce(
      exportDbOutput([
        {
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-00000',
        },
      ])
    );
    readFileMock.mockRejectedValueOnce(new Error('/proc/mounts unreadable'));

    const result = await getUsbDriveDeviceInfo();

    expect(result).toEqual(
      expect.objectContaining({ name: 'sdb1', mountpoint: null })
    );
  });

  test('ignores non-USB and non-block-device entries in the udev database', async () => {
    // Exercises all the parseExportDb filter branches:
    //   - non-USB device (ID_BUS=ata): skipped at the ID_BUS check
    //   - USB non-block device (SUBSYSTEM=usb): skipped at the SUBSYSTEM check
    //   - USB block device with unexpected DEVTYPE: skipped at the DEVTYPE check
    //   - USB block device with no DEVNAME: skipped at the DEVNAME check
    execMock.mockResolvedValueOnce({
      stdout: [
        // non-USB block device
        'E: DEVNAME=/dev/sda1\nE: SUBSYSTEM=block\nE: DEVTYPE=partition\nE: ID_BUS=ata',
        // USB non-block device (e.g. USB serial)
        'E: DEVNAME=/dev/ttyUSB0\nE: SUBSYSTEM=tty\nE: ID_BUS=usb',
        // USB block device with unexpected DEVTYPE (e.g. loop)
        'E: DEVNAME=/dev/loop0\nE: SUBSYSTEM=block\nE: DEVTYPE=loop\nE: ID_BUS=usb',
        // USB block device missing DEVNAME
        'E: SUBSYSTEM=block\nE: DEVTYPE=partition\nE: ID_BUS=usb',
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce('');

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when partition is acting as an LVM', async () => {
    mockBlockDeviceOnce({ fstype: 'LVM2_member', type: 'part' });

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns undefined when found drive is mounted outside /media', async () => {
    mockBlockDeviceOnce({
      mountpoint: '/home/user/mount',
      path: '/dev/sdb1',
      type: 'part',
      fstype: 'vfat',
    });

    expect(await getUsbDriveDeviceInfo()).toBeUndefined();
  });

  test('returns device info for USB drive', async () => {
    execMock.mockResolvedValueOnce(
      exportDbOutput([
        {
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-12345',
        },
      ])
    );
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/media/usb-drive-sdb1' },
      ])
    );

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

    expect(readFileMock).toHaveBeenCalledWith('/proc/mounts', 'utf-8');
    expect(execMock).toHaveBeenCalledWith('udevadm', ['info', '--export-db']);
  });

  test('returns device info for unpartitioned USB disk', async () => {
    // An unpartitioned drive has only a disk-level entry in the udev database
    execMock.mockResolvedValueOnce(
      exportDbOutput([{ devname: '/dev/sdb', devtype: 'disk' }])
    );
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getUsbDriveDeviceInfo();

    expect(result).toEqual({
      name: 'sdb',
      path: '/dev/sdb',
      mountpoint: null,
      fstype: null,
      fsver: null,
      label: null,
      type: 'disk',
    });
  });

  test('prefers partition over parent disk when both appear in udev database', async () => {
    // After formatting, udev may have both the disk and its new partition
    // in the database. We should prefer the partition.
    execMock.mockResolvedValueOnce(
      exportDbOutput([
        { devname: '/dev/sdb', devtype: 'disk' },
        {
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-HGMZG',
        },
      ])
    );
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getUsbDriveDeviceInfo();

    expect(result).toEqual({
      name: 'sdb1',
      path: '/dev/sdb1',
      mountpoint: null,
      fstype: 'vfat',
      fsver: 'FAT32',
      label: 'VxUSB-HGMZG',
      type: 'part',
    });
  });

  test('handles multiple USB devices and selects first valid data drive', async () => {
    execMock.mockResolvedValueOnce(
      exportDbOutput([
        { devname: '/dev/sdb1', devtype: 'partition', fstype: 'LVM2_member' }, // not a valid data drive
        {
          devname: '/dev/sdc1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-00000',
        },
      ])
    );
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdc1', mountpoint: '/media/usb-drive-sdc1' },
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

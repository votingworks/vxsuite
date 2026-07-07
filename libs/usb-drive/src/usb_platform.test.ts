import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  BlockDeviceChangeWatcher,
  createBlockDeviceChangeWatcher,
  getAllDiskDevices,
} from './block_devices';
import { exec } from './exec';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpointSchema,
} from './types';
import { RealUsbPlatform } from './usb_platform';
import { UsbPlatformDrive } from './usb_platform_types';

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec')> => ({
    ...(await importActual()),
    exec: vi.fn().mockRejectedValue(new Error('exec not mocked')),
    spawn: vi.fn().mockRejectedValue(new Error('spawn not mocked')),
  })
);

// getAllDiskDevices and createBlockDeviceChangeWatcher are exercised in
// block_devices.test.ts; here we mock them to test RealUsbPlatform's own logic
// (transformation and delegation) in isolation.
vi.mock(
  import('./block_devices.js'),
  async (importActual): Promise<typeof import('./block_devices')> => ({
    ...(await importActual()),
    getAllDiskDevices: vi.fn(),
    createBlockDeviceChangeWatcher: vi.fn(),
  })
);

const execMock = vi.mocked(exec);
const getAllDiskDevicesMock = vi.mocked(getAllDiskDevices);
const createBlockDeviceChangeWatcherMock = vi.mocked(
  createBlockDeviceChangeWatcher
);

const diskPath = UsbDiskDevPathSchema.decode('/dev/sdb');
const partPath = UsbPartitionDevPathSchema.decode('/dev/sdb1');
const mountpoint = UsbPartitionMountpointSchema.decode(
  '/media/vx/usb-drive-sdb1'
);

beforeEach(() => {
  vi.clearAllMocks();
  execMock.mockResolvedValue({ stdout: '', stderr: '' });
});

describe('getDrives', () => {
  test('returns an empty array when no drives are present', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([]);

    expect(await new RealUsbPlatform().getDrives()).toEqual([]);
  });

  test('maps a single FAT32 partition to a fat32 drive', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: 'SanDisk',
        model: 'Ultra',
        serial: 'ABC123',
        partitions: [
          {
            partPath,
            mountpoint,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [
        {
          diskPath,
          partition: {
            partPath,
            fstype: 'fat32',
            label: 'VxUSB-ABCDE',
            mountpoint,
          },
        },
      ]
    );
  });

  test('maps a single ext4 partition to an ext4 drive', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath,
            mountpoint,
            fstype: 'ext4',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [
        {
          diskPath,
          partition: {
            partPath,
            fstype: 'ext4',
            label: 'VxUSB-ABCDE',
            mountpoint,
          },
        },
      ]
    );
  });

  test('omits the partition for an unsupported filesystem', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath,
            mountpoint,
            fstype: 'ntfs',
            label: 'WINDOWS',
          },
        ],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [{ diskPath }]
    );
  });

  test('omits the partition for a vfat partition that is not FAT32', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath,
            mountpoint,
            fstype: 'vfat',
            fsver: 'FAT16',
          },
        ],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [{ diskPath }]
    );
  });

  test('omits the partition for an unformatted drive', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [{ diskPath }]
    );
  });

  test('omits the partition for a drive with multiple partitions', async () => {
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath,
            mountpoint,
            fstype: 'vfat',
            fsver: 'FAT32',
          },
          {
            partPath: UsbPartitionDevPathSchema.decode('/dev/sdb2'),
            fstype: 'vfat',
            fsver: 'FAT32',
          },
        ],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [{ diskPath }]
    );
  });

  test('maps multiple drives', async () => {
    const diskPathC = UsbDiskDevPathSchema.decode('/dev/sdc');
    getAllDiskDevicesMock.mockResolvedValueOnce([
      {
        diskPath,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [{ partPath, mountpoint, fstype: 'vfat', fsver: 'FAT32' }],
      },
      {
        diskPath: diskPathC,
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [],
      },
    ]);

    expect(await new RealUsbPlatform().getDrives()).toEqual<UsbPlatformDrive[]>(
      [
        { diskPath, partition: { partPath, fstype: 'fat32', mountpoint } },
        { diskPath: diskPathC },
      ]
    );
  });
});

describe('watchChanges', () => {
  test('delegates to createBlockDeviceChangeWatcher and returns its watcher', () => {
    const watcher: BlockDeviceChangeWatcher = { stop: vi.fn() };
    createBlockDeviceChangeWatcherMock.mockReturnValue(watcher);
    const onChange = vi.fn();

    const result = new RealUsbPlatform().watchChanges(onChange);

    expect(createBlockDeviceChangeWatcherMock).toHaveBeenCalledWith(onChange);
    expect(result).toEqual(watcher);
  });
});

describe('mountPartition', () => {
  test('runs the mount script via sudo', async () => {
    await new RealUsbPlatform().mountPartition(partPath);

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      expect.stringContaining('scripts/mount.sh'),
      partPath,
    ]);
  });

  test('propagates exec failures', async () => {
    execMock.mockRejectedValueOnce(new Error('mount failed'));

    await expect(
      new RealUsbPlatform().mountPartition(partPath)
    ).rejects.toThrow('mount failed');
  });
});

describe('unmountPartition', () => {
  test('runs the unmount script via sudo', async () => {
    await new RealUsbPlatform().unmountPartition(mountpoint);

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      expect.stringContaining('scripts/unmount.sh'),
      mountpoint,
    ]);
  });
});

describe('formatDrive', () => {
  test('runs the FAT32 format script via sudo', async () => {
    await new RealUsbPlatform().formatDrive(diskPath, 'fat32', 'VxUSB-ABCDE');

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      expect.stringContaining('scripts/format_fat32.sh'),
      diskPath,
      'VxUSB-ABCDE',
    ]);
  });

  test('runs the ext4 format script via sudo', async () => {
    await new RealUsbPlatform().formatDrive(diskPath, 'ext4', 'VxUSB-ABCDE');

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      expect.stringContaining('scripts/format_ext4.sh'),
      diskPath,
      'VxUSB-ABCDE',
    ]);
  });

  test('propagates exec failures', async () => {
    execMock.mockRejectedValueOnce(new Error('format failed'));

    await expect(
      new RealUsbPlatform().formatDrive(diskPath, 'fat32', 'VxUSB-ABCDE')
    ).rejects.toThrow('format failed');
  });
});

describe('sync', () => {
  test('runs sync -f on the mountpoint', async () => {
    await new RealUsbPlatform().sync(mountpoint);

    expect(execMock).toHaveBeenCalledWith('sync', ['-f', mountpoint]);
  });
});

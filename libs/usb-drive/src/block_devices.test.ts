import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type FSWatcher,
  promises as fs,
  mkdirSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import {
  createBlockDeviceChangeWatcher,
  getAllDiskDevices,
  type UsbDiskDeviceInfo,
} from './block_devices.js';
import { exec } from './exec.js';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpointSchema,
} from './types.js';

const readFileMock = vi.mocked(fs.readFile);
const watchMock = vi.mocked(watch);
const execMock = vi.mocked(exec);

vi.mock(
  import('node:fs'),
  async (importActual): Promise<typeof import('node:fs')> => {
    const actual = await importActual();
    return {
      ...actual,
      watch: vi.fn(actual.watch) as unknown as typeof actual.watch,
      promises: {
        ...actual.promises,
        readFile: vi.fn().mockRejectedValue(new Error('readFile not mocked')),
      },
    };
  }
);

// Pin the resolved media mount dir so tests don't depend on the host
// filesystem (e.g., whether /media/vx exists on the CI runner).
vi.mock(import('./media_mount_dir.js'), () => ({
  getMediaMountDir: () => '/media/vx',
  getResolvedMediaMountDir: () => '/media/vx',
  getRealUsbDriveGlobPattern: () => '/media/vx/**/*',
}));

vi.mock(
  import('./exec.js'),
  async (importActual): Promise<typeof import('./exec.js')> => ({
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
  fstype?: string;
  fsver?: string;
  label?: string;
  vendor?: string;
  model?: string;
  serial?: string;
}): string {
  const {
    devname,
    devtype = 'partition',
    idBus = 'usb',
    fstype,
    fsver,
    label,
    vendor,
    model,
    serial,
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
  if (vendor) lines.push(`E: ID_VENDOR=${vendor}`);
  if (model) lines.push(`E: ID_MODEL=${model}`);
  if (serial) lines.push(`E: ID_SERIAL_SHORT=${serial}`);
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

describe('getAllUsbDrives', () => {
  test('returns empty array when no USB block devices found', async () => {
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');

    expect(await getAllDiskDevices()).toEqual([]);
  });

  test('returns empty array when udevadm fails', async () => {
    execMock.mockRejectedValueOnce(new Error('udevadm failed'));
    readFileMock.mockResolvedValueOnce('');

    expect(await getAllDiskDevices()).toEqual([]);
  });

  test('ignores non-USB, non-block, unexpected DEVTYPE, and missing DEVNAME entries', async () => {
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

    expect(await getAllDiskDevices()).toEqual([]);
  });

  test('does not treat a disk as its own partition when devnames match', async () => {
    // isPartitionOfDisk('/dev/sdb', '/dev/sdb') → suffix is '' → false
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllDiskDevices();

    // Disk has no real partitions (the partition with the same devname is not
    // recognized as a child), so it appears as an unformatted drive.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ diskPath: '/dev/sdb', partitions: [] });
  });

  test('recognizes nvme-style p-suffix partitions', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/nvme0n1', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/nvme0n1p1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
          label: 'VxUSB-ABCDE',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllDiskDevices();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      diskPath: '/dev/nvme0n1',
      partitions: [{ partPath: '/dev/nvme0n1p1' }],
    });
  });

  test('returns disk with its partitions', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({
          devname: '/dev/sdb',
          devtype: 'disk',
          vendor: 'SanDisk',
          model: 'Ultra',
          serial: 'ABC123',
        }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
          label: 'VxUSB-ABCDE',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/media/vx/usb-drive-sdb1' },
      ])
    );

    const result = await getAllDiskDevices();

    expect(result).toEqual([
      {
        diskPath: '/dev/sdb',
        vendor: 'SanDisk',
        model: 'Ultra',
        serial: 'ABC123',
        partitions: [
          {
            partPath: '/dev/sdb1',
            mountpoint: '/media/vx/usb-drive-sdb1',
            fstype: 'exfat',
            fsver: '1.0',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);
  });

  test('returns disk with empty partitions array when unformatted', async () => {
    execMock.mockResolvedValueOnce(
      exportDbOutput([{ devname: '/dev/sdb', devtype: 'disk' }])
    );
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllDiskDevices();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [],
      },
    ]);
  });

  test('returns multiple disks', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
          label: 'VxUSB-11111',
        }),
        exportDbEntry({ devname: '/dev/sdc', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdc1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
          label: 'VxUSB-22222',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllDiskDevices();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ diskPath: '/dev/sdb' });
    expect(result[1]).toMatchObject({ diskPath: '/dev/sdc' });
  });

  test('excludes disk whose only partition is LVM', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'LVM2_member',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllDiskDevices();

    // Disk has partitions but none are valid data partitions — skip entirely
    // rather than returning an empty-partition disk that looks unformatted.
    expect(result).toEqual([]);
  });

  test('excludes disks mounted outside /media', async () => {
    execMock.mockResolvedValueOnce(
      exportDbOutput([{ devname: '/dev/sdb', devtype: 'disk' }])
    );
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb', mountpoint: '/home/user/mount' },
      ])
    );

    const result = await getAllDiskDevices();

    // Disk mounted outside /media is not a valid data drive
    expect(result).toEqual([]);
  });

  test('excludes disk whose partitions are all mounted outside /media', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/home/user/mount' },
      ])
    );

    const result = await getAllDiskDevices();

    // Partition mounted outside /media — skip the disk entirely rather than
    // returning an empty-partition disk that looks like an unformatted drive.
    expect(result).toEqual([]);
  });

  test('includes partition with no parent disk entry in udev', async () => {
    // Some USB card readers expose only a partition entry (not a parent disk)
    // in the udev database.
    execMock.mockResolvedValueOnce({
      stdout: exportDbEntry({
        devname: '/dev/sdb1',
        devtype: 'partition',
        fstype: 'exfat',
        fsver: '1.0',
        label: 'VxUSB-ABCDE',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/media/vx/usb-drive-sdb1' },
      ])
    );

    const result = await getAllDiskDevices();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath: UsbPartitionDevPathSchema.decode('/dev/sdb1'),
            mountpoint: UsbPartitionMountpointSchema.decode(
              '/media/vx/usb-drive-sdb1'
            ),
            fstype: 'exfat',
            fsver: '1.0',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);
  });

  test('includes unmounted partition with no parent disk entry in udev', async () => {
    // An orphan partition is unmounted when first detected — before
    // auto-mounting has run — so a missing mountpoint must not crash the scan.
    execMock.mockResolvedValueOnce({
      stdout: exportDbEntry({
        devname: '/dev/sdb1',
        devtype: 'partition',
        fstype: 'exfat',
        fsver: '1.0',
        label: 'VxUSB-ABCDE',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent([]));

    const result = await getAllDiskDevices();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        diskPath: UsbDiskDevPathSchema.decode('/dev/sdb'),
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath: UsbPartitionDevPathSchema.decode('/dev/sdb1'),
            mountpoint: undefined,
            fstype: 'exfat',
            fsver: '1.0',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);
  });

  test('derives parent disk path for orphan partition on a p-suffixed disk', async () => {
    // /dev/nvme0p1 → /dev/nvme0 is right, but /dev/sdp1 → /dev/sd is not.
    execMock.mockResolvedValueOnce({
      stdout: exportDbEntry({
        devname: '/dev/sdp1',
        devtype: 'partition',
        fstype: 'exfat',
        fsver: '1.0',
        label: 'VxUSB-ABCDE',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdp1', mountpoint: '/media/vx/usb-drive-sdp1' },
      ])
    );

    const result = await getAllDiskDevices();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        diskPath: UsbDiskDevPathSchema.decode('/dev/sdp'),
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            partPath: UsbPartitionDevPathSchema.decode('/dev/sdp1'),
            mountpoint: UsbPartitionMountpointSchema.decode(
              '/media/vx/usb-drive-sdp1'
            ),
            fstype: 'exfat',
            fsver: '1.0',
            label: 'VxUSB-ABCDE',
          },
        ],
      },
    ]);
  });

  test('excludes orphan partition with no parent disk that fails isDataUsbDrive', async () => {
    // Some USB card readers expose only a partition entry (not a parent disk)
    // in the udev database. If the partition is mounted outside /media, it
    // should be excluded entirely.
    execMock.mockResolvedValueOnce({
      stdout: exportDbEntry({
        devname: '/dev/sdb1',
        devtype: 'partition',
        fstype: 'exfat',
        fsver: '1.0',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/home/user/mount' },
      ])
    );

    const result = await getAllDiskDevices();

    // Partition mounted outside /media is not a valid data drive
    expect(result).toEqual([]);
  });

  test('treats drive as unmounted when /proc/mounts is unreadable', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
          label: 'VxUSB-ABCDE',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockRejectedValueOnce(new Error('/proc/mounts unreadable'));

    const result = await getAllDiskDevices();

    expect(result).toHaveLength(1);
    expect(result[0]?.partitions[0]).toMatchObject({ mountpoint: undefined });
  });

  test('does not match mountpoints that merely share a prefix with the media dir', async () => {
    // /media/vxfoo must NOT match /media/vx — the check requires a trailing
    // separator.
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb1',
          devtype: 'partition',
          fstype: 'exfat',
          fsver: '1.0',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/media/vxfoo/something' },
      ])
    );

    expect(await getAllDiskDevices()).toEqual([]);
  });
});

describe('createBlockDeviceChangeWatcher', () => {
  let udevDataDir: string;

  beforeEach(() => {
    udevDataDir = makeTemporaryDirectory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function capturedListener(): (
    event: string,
    filename: string | null
  ) => void {
    return watchMock.mock.calls[0]?.[1] as (
      event: string,
      filename: string | null
    ) => void;
  }

  test('watches the udev database by default', () => {
    const watcher = createBlockDeviceChangeWatcher(vi.fn());
    expect(watchMock).toHaveBeenCalledWith(
      '/run/udev/data',
      expect.any(Function)
    );
    watcher.stop();
  });

  test('reports block device entry changes', async () => {
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);

    writeFileSync(join(udevDataDir, 'b8:0'), 'E:ID_BUS=usb');

    await vi.waitFor(() => expect(onDeviceChange).toHaveBeenCalledTimes(1));

    watcher.stop();
  });

  test('debounces bursts of changes into one call', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);
    const listener = capturedListener();

    listener('rename', 'b8:0');
    listener('rename', 'b8:1');
    listener('rename', 'b8:0');

    await vi.advanceTimersByTimeAsync(49);
    expect(onDeviceChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDeviceChange).toHaveBeenCalledTimes(1);

    watcher.stop();
  });

  test('ignores entries for other subsystems and temp files', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);
    const listener = capturedListener();

    for (const name of ['+acpi:LNXCPU:00', 'c189:1', 'n3', '.#b8:0XXXXXX']) {
      listener('rename', name);
    }

    await vi.advanceTimersByTimeAsync(50);
    expect(onDeviceChange).not.toHaveBeenCalled();

    watcher.stop();
  });

  test('treats an event without a filename as a change', async () => {
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);

    const listener = capturedListener();
    listener('rename', null);

    await vi.waitFor(() => expect(onDeviceChange).toHaveBeenCalledTimes(1));

    watcher.stop();
  });

  test('stop() discards a pending change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);

    capturedListener()('rename', 'b8:0');
    watcher.stop();

    await vi.advanceTimersByTimeAsync(50);
    expect(onDeviceChange).not.toHaveBeenCalled();
  });

  test('retries until the directory exists, then reports a change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const missingDir = join(udevDataDir, 'missing');
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, missingDir);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(onDeviceChange).not.toHaveBeenCalled();

    mkdirSync(missingDir);
    await vi.advanceTimersByTimeAsync(1_000 + 50);
    expect(watchMock).toHaveBeenCalledTimes(3);
    expect(onDeviceChange).toHaveBeenCalledTimes(1);

    watcher.stop();
  });

  test('restarts the watch after a watcher error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange, udevDataDir);

    const failedWatcher = watchMock.mock.results[0]?.value as FSWatcher;
    failedWatcher.emit('error', new Error('watch failed'));

    await vi.advanceTimersByTimeAsync(1_000 + 50);
    expect(watchMock).toHaveBeenCalledTimes(2);
    expect(onDeviceChange).toHaveBeenCalledTimes(1);

    watcher.stop();
  });

  test('does not restart after stop()', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const missingDir = join(udevDataDir, 'missing');
    const watcher = createBlockDeviceChangeWatcher(vi.fn(), missingDir);
    watcher.stop();
    mkdirSync(missingDir);

    const lateWatcher = createBlockDeviceChangeWatcher(vi.fn(), missingDir);
    lateWatcher.stop();
    (watchMock.mock.results[1]?.value as FSWatcher).emit(
      'error',
      new Error('watch failed')
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(watchMock).toHaveBeenCalledTimes(2);
  });
});

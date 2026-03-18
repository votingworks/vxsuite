import { beforeEach, describe, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { mockChildProcess } from '@votingworks/test-utils';
import {
  createBlockDeviceChangeWatcher,
  getAllUsbDrives,
  UsbDiskDeviceInfo,
} from './block_devices';
import { exec, spawn } from './exec';

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
    spawn: vi.fn().mockRejectedValue(new Error('spawn not mocked')),
  })
);

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  vi.clearAllMocks();
  spawnMock.mockImplementation(mockChildProcess);
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

    expect(await getAllUsbDrives()).toEqual([]);
  });

  test('returns empty array when udevadm fails', async () => {
    execMock.mockRejectedValueOnce(new Error('udevadm failed'));
    readFileMock.mockResolvedValueOnce('');

    expect(await getAllUsbDrives()).toEqual([]);
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

    expect(await getAllUsbDrives()).toEqual([]);
  });

  test('does not treat a disk as its own partition when devnames match', async () => {
    // isPartitionOfDisk('/dev/sdb', '/dev/sdb') → suffix is '' → false
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/sdb', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdb',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllUsbDrives();

    // Disk has no real partitions (the partition with the same devname is not
    // recognized as a child), so it appears as an unformatted drive.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ devPath: '/dev/sdb', partitions: [] });
  });

  test('recognizes nvme-style p-suffix partitions', async () => {
    execMock.mockResolvedValueOnce({
      stdout: [
        exportDbEntry({ devname: '/dev/nvme0n1', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/nvme0n1p1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllUsbDrives();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      devPath: '/dev/nvme0n1',
      partitions: [{ devPath: '/dev/nvme0n1p1' }],
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
          fstype: 'vfat',
          fsver: 'FAT32',
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

    const result = await getAllUsbDrives();

    expect(result).toEqual([
      {
        devPath: '/dev/sdb',
        vendor: 'SanDisk',
        model: 'Ultra',
        serial: 'ABC123',
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: '/media/vx/usb-drive-sdb1',
            fstype: 'vfat',
            fsver: 'FAT32',
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

    const result = await getAllUsbDrives();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        devPath: '/dev/sdb',
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
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-11111',
        }),
        exportDbEntry({ devname: '/dev/sdc', devtype: 'disk' }),
        exportDbEntry({
          devname: '/dev/sdc1',
          devtype: 'partition',
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-22222',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(procMountsContent());

    const result = await getAllUsbDrives();

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ devPath: '/dev/sdb' });
    expect(result[1]).toMatchObject({ devPath: '/dev/sdc' });
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

    const result = await getAllUsbDrives();

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

    const result = await getAllUsbDrives();

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
          fstype: 'vfat',
          fsver: 'FAT32',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/home/user/mount' },
      ])
    );

    const result = await getAllUsbDrives();

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
        fstype: 'vfat',
        fsver: 'FAT32',
        label: 'VxUSB-ABCDE',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/media/vx/usb-drive-sdb1' },
      ])
    );

    const result = await getAllUsbDrives();

    expect(result).toEqual<UsbDiskDeviceInfo[]>([
      {
        devPath: '/dev/sdb',
        vendor: undefined,
        model: undefined,
        serial: undefined,
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: '/media/vx/usb-drive-sdb1',
            fstype: 'vfat',
            fsver: 'FAT32',
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
        fstype: 'vfat',
        fsver: 'FAT32',
      }),
      stderr: '',
    });
    readFileMock.mockResolvedValueOnce(
      procMountsContent([
        { device: '/dev/sdb1', mountpoint: '/home/user/mount' },
      ])
    );

    const result = await getAllUsbDrives();

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
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        }),
      ].join('\n\n'),
      stderr: '',
    });
    readFileMock.mockRejectedValueOnce(new Error('/proc/mounts unreadable'));

    const result = await getAllUsbDrives();

    expect(result).toHaveLength(1);
    expect(result[0]?.partitions[0]).toMatchObject({ mountpoint: undefined });
  });
});

describe('createBlockDeviceChangeWatcher', () => {
  test('calls onDeviceChange when udevadm stdout fires (debounced)', async () => {
    vi.useFakeTimers();

    const proc = mockChildProcess();
    spawnMock.mockReturnValue(proc);

    const onDeviceChange = vi.fn();
    const watcher = createBlockDeviceChangeWatcher(onDeviceChange);

    proc.stdout.append('UDEV event 1');
    proc.stdout.append('UDEV event 2');
    proc.stdout.append('UDEV event 3');

    // No callback yet — debounce timer hasn't fired
    expect(onDeviceChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    // Exactly one callback (debounced)
    expect(onDeviceChange).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    watcher.stop();
  });

  test('stop() kills the subprocess and prevents restart', async () => {
    vi.useFakeTimers();

    const proc = mockChildProcess();
    const killSpy = vi.spyOn(proc, 'kill');
    spawnMock.mockReturnValue(proc);

    const watcher = createBlockDeviceChangeWatcher(vi.fn());
    watcher.stop();

    expect(killSpy).toHaveBeenCalled();

    proc.emit('exit');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  test('restarts subprocess after exit', async () => {
    vi.useFakeTimers();

    const firstProc = mockChildProcess();
    const secondProc = mockChildProcess();
    spawnMock.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const watcher = createBlockDeviceChangeWatcher(vi.fn());
    expect(spawnMock).toHaveBeenCalledTimes(1);

    firstProc.emit('exit');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    watcher.stop();
  });

  test('handles subprocess spawn error without crashing', () => {
    const proc = mockChildProcess();
    spawnMock.mockReturnValue(proc);

    const watcher = createBlockDeviceChangeWatcher(vi.fn());

    expect(() => proc.emit('error', new Error('spawn ENOENT'))).not.toThrow();

    watcher.stop();
  });

  test('stop() prevents scheduled restart from spawning', async () => {
    vi.useFakeTimers();

    const firstProc = mockChildProcess();
    spawnMock.mockReturnValueOnce(firstProc);

    const watcher = createBlockDeviceChangeWatcher(vi.fn());
    firstProc.emit('exit');
    watcher.stop();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});

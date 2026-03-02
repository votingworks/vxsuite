import { beforeEach, describe, expect, test, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { mockChildProcess } from '@votingworks/test-utils';
import {
  BlockDeviceInfo,
  createUsbDriveMonitor,
  getUsbDriveDeviceInfo,
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

describe('createUsbDriveMonitor', () => {
  test('initial cache is undefined, populated by async initial refresh', async () => {
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');

    const monitor = createUsbDriveMonitor();

    // Cache starts undefined before the async initial refresh resolves
    expect(monitor.getDeviceInfo()).toEqual(undefined);

    // Let the initial refresh complete
    await vi.waitFor(() =>
      expect(execMock).toHaveBeenCalledWith('udevadm', ['info', '--export-db'])
    );

    monitor.stop();
  });

  test('refresh() updates the cached device info', async () => {
    // Initial refresh returns nothing
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');

    const monitor = createUsbDriveMonitor();

    // Set up a USB drive for the explicit refresh
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

    await monitor.refresh();

    expect(monitor.getDeviceInfo()).toEqual(
      expect.objectContaining({
        name: 'sdb1',
        mountpoint: '/media/usb-drive-sdb1',
      })
    );

    monitor.stop();
  });

  test('spawns udevadm monitor subprocess with correct args', () => {
    execMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    const monitor = createUsbDriveMonitor();

    expect(spawnMock).toHaveBeenCalledWith('udevadm', [
      'monitor',
      '--udev',
      '--subsystem-match=block',
    ]);

    monitor.stop();
  });

  test('debounces subprocess stdout events and refreshes cache', async () => {
    vi.useFakeTimers();

    // Initial refresh returns nothing
    execMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    const proc = mockChildProcess();
    spawnMock.mockReturnValue(proc);

    const monitor = createUsbDriveMonitor();

    // Simulate three rapid stdout events (e.g. a burst from USB plug-in)
    proc.stdout.append('UDEV event 1');
    proc.stdout.append('UDEV event 2');
    proc.stdout.append('UDEV event 3');

    // No refresh yet — debounce timer hasn't fired
    const callsBefore = execMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(50);

    // Exactly one refresh triggered (debounced)
    expect(execMock.mock.calls.length).toEqual(callsBefore + 1);

    vi.useRealTimers();
    monitor.stop();
  });

  test('restarts subprocess after exit', async () => {
    vi.useFakeTimers();

    execMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    const firstProc = mockChildProcess();
    const secondProc = mockChildProcess();
    spawnMock.mockReturnValueOnce(firstProc).mockReturnValueOnce(secondProc);

    const monitor = createUsbDriveMonitor();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Simulate the subprocess exiting
    firstProc.emit('exit');

    // Restart happens after a 1s delay
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    monitor.stop();
  });

  test('stop() kills the subprocess and prevents restart', async () => {
    vi.useFakeTimers();

    execMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    const proc = mockChildProcess();
    const killSpy = vi.spyOn(proc, 'kill');
    spawnMock.mockReturnValue(proc);

    const monitor = createUsbDriveMonitor();
    monitor.stop();

    expect(killSpy).toHaveBeenCalled();

    // Simulate exit after stop — should not restart
    proc.emit('exit');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawnMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  test('calls onRefresh on first refresh and when state changes', async () => {
    // Initial refresh: no drive
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');

    const onRefresh = vi.fn();
    const monitor = createUsbDriveMonitor(onRefresh);

    // Wait for initial async refresh to complete
    await vi.waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));

    // Refresh with same state (no drive) — should NOT fire callback
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValueOnce('');
    await monitor.refresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Refresh with new state (drive appeared) — should fire callback
    mockBlockDeviceOnce();
    await monitor.refresh();
    expect(onRefresh).toHaveBeenCalledTimes(2);

    monitor.stop();
  });

  test('handles subprocess spawn error without crashing', () => {
    execMock.mockResolvedValue({ stdout: '', stderr: '' });
    readFileMock.mockResolvedValue('');

    const proc = mockChildProcess();
    spawnMock.mockReturnValue(proc);

    const monitor = createUsbDriveMonitor();

    // Emitting an error event should not throw (it is handled)
    expect(() => proc.emit('error', new Error('spawn ENOENT'))).not.toThrow();

    monitor.stop();
  });
});

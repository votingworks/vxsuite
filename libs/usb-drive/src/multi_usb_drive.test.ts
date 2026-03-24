import { beforeEach, describe, expect, test, vi } from 'vitest';
import { join } from 'node:path';
import { PromiseWithChild } from 'node:child_process';
import { LogEventId, mockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { deferred, sleep } from '@votingworks/basics';
import { detectMultiUsbDrive } from './multi_usb_drive';
import { exec } from './exec';
import { getAllUsbDrives, UsbDiskDeviceInfo } from './block_devices';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

const featureFlagMock = getFeatureFlagMock();

type ExecResult = Awaited<ReturnType<typeof exec>>;

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
}));

const execMock = vi.mocked(exec);
const getAllUsbDrivesMock = vi.mocked(getAllUsbDrives);

vi.mock(import('./exec.js'), async (importActual) => ({
  ...(await importActual()),
  exec: vi.fn().mockRejectedValue(new Error('exec not mocked')),
}));

// Shared state for mock block_devices module
let mockDrives: UsbDiskDeviceInfo[] = [];
let capturedWatcherCallback: (() => void) | undefined;
const mockWatcherStop = vi.fn();

vi.mock(import('./block_devices.js'), async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    getAllUsbDrives: vi.fn(() => Promise.resolve(mockDrives)),
    createBlockDeviceChangeWatcher: vi.fn((onDeviceChange: () => void) => {
      capturedWatcherCallback = onDeviceChange;
      return { stop: mockWatcherStop };
    }),
  };
});

beforeEach(() => {
  mockDrives = [];
  capturedWatcherCallback = undefined;
  mockWatcherStop.mockReset();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  featureFlagMock.resetFeatureFlags();
});

function makeDisk(
  overrides: Partial<UsbDiskDeviceInfo> = {}
): UsbDiskDeviceInfo {
  return {
    devPath: '/dev/sdb',
    vendor: 'SanDisk',
    model: 'Ultra',
    serial: 'SN123',
    partitions: [
      {
        devPath: '/dev/sdb1',
        mountpoint: '/media/vx/usb-drive-sdb1',
        fstype: 'vfat',
        fsver: 'FAT32',
        label: 'VxUSB-ABCDE',
      },
    ],
    ...overrides,
  };
}

test('works even when USE_MOCK_USB_DRIVE feature flag is enabled', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const multiUsbDrive = detectMultiUsbDrive(mockLogger({ fn: vi.fn }));
  expect(multiUsbDrive.getDrives()).toEqual([]);
  multiUsbDrive.stop();
});

describe('getDrives', () => {
  test('returns empty array initially', () => {
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);
    expect(multiUsbDrive.getDrives()).toEqual([]);
    multiUsbDrive.stop();
  });

  test('returns drives after initial refresh resolves', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    const [drive] = multiUsbDrive.getDrives();
    expect(drive).toMatchObject({
      devPath: '/dev/sdb',
      vendor: 'SanDisk',
      model: 'Ultra',
      serial: 'SN123',
    });
    expect(drive?.partitions[0]).toMatchObject({
      devPath: '/dev/sdb1',
      mount: { type: 'mounted', mountPoint: '/media/vx/usb-drive-sdb1' },
    });

    multiUsbDrive.stop();
  });

  test('returns unmounted partition as unmounted', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'exfat',
            fsver: '1.0',
            label: undefined,
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
      type: 'unmounted',
    });

    multiUsbDrive.stop();
  });

  test('returns empty partitions for unformatted drive', async () => {
    mockDrives = [makeDisk({ partitions: [] })];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()[0]?.partitions).toEqual([]);

    multiUsbDrive.stop();
  });

  test('returns multiple drives', async () => {
    mockDrives = [
      makeDisk({ devPath: '/dev/sdb' }),
      makeDisk({ devPath: '/dev/sdc', partitions: [] }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()).toHaveLength(2);

    multiUsbDrive.stop();
  });
});

describe('refresh', () => {
  test('updates the cached drives', async () => {
    mockDrives = [];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    expect(multiUsbDrive.getDrives()).toHaveLength(0);

    mockDrives = [makeDisk()];
    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()).toHaveLength(1);

    multiUsbDrive.stop();
  });

  test('calls onChange on first refresh and when state changes, but not on no-op refreshes', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const onChange = vi.fn();
    const multiUsbDrive = detectMultiUsbDrive(logger, { onChange });

    // Initial refresh fires onChange (first refresh always fires)
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(1); // factory doRefresh (first=true)

    // Refresh with same state — should NOT fire onChange
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Refresh with new state — should fire onChange
    mockDrives = [makeDisk()];
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(2);

    multiUsbDrive.stop();
  });

  test('watcher callback triggers a refresh', async () => {
    mockDrives = [];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();
    expect(multiUsbDrive.getDrives()).toHaveLength(0);

    mockDrives = [makeDisk()];
    // Trigger the watcher callback (simulates a udevadm event)
    capturedWatcherCallback?.();

    await vi.waitFor(() => expect(multiUsbDrive.getDrives()).toHaveLength(1));

    multiUsbDrive.stop();
  });

  test('clears eject state for drives that were physically removed', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount
    await multiUsbDrive.ejectDrive('/dev/sdb');

    // Drive is physically removed
    mockDrives = [];
    await multiUsbDrive.refresh();

    // Drive no longer in the list
    expect(multiUsbDrive.getDrives()).toHaveLength(0);

    // Drive re-plugged — eject state should be cleared
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: 'VxUSB-ABCDE',
          },
        ],
      }),
    ];
    await multiUsbDrive.refresh();
    expect(multiUsbDrive.getDrives()).toHaveLength(1);

    multiUsbDrive.stop();
  });
});

describe('stop', () => {
  test('stops the watcher', () => {
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);
    multiUsbDrive.stop();
    expect(mockWatcherStop).toHaveBeenCalled();
  });

  test('prevents doRefresh from running after stop', async () => {
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();
    getAllUsbDrivesMock.mockClear();

    multiUsbDrive.stop();

    // refresh() should be a no-op once stopped
    await multiUsbDrive.refresh();

    expect(getAllUsbDrivesMock).not.toHaveBeenCalled();
  });

  test('prevents doAutoMount from starting new mounts after stop (race: stop during getAllUsbDrives)', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        },
      ],
    });

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    // Wait for the initial doRefresh to complete (no drives yet).
    await multiUsbDrive.refresh();

    // Defer the next getAllUsbDrives call so stop() can be called while it
    // is in-flight inside doRefresh.
    const driveQuery = deferred<UsbDiskDeviceInfo[]>();
    getAllUsbDrivesMock.mockReturnValueOnce(driveQuery.promise);
    execMock.mockClear();

    // Start a refresh — doRefresh passes the stopped check and then awaits
    // getAllUsbDrives(), which is still pending.
    const refreshPromise = multiUsbDrive.refresh();

    // Stop while getAllUsbDrives is still pending.
    multiUsbDrive.stop();

    // Resolve with an unmounted FAT32 partition — doRefresh resumes, calls
    // doAutoMount, but doAutoMount should return early due to stopped flag.
    driveQuery.resolve([unmountedPartitionDisk]);
    await refreshPromise;
    await sleep(0);

    expect(execMock).not.toHaveBeenCalledWith(
      'sudo',
      expect.arrayContaining(['mount.sh'])
    );
  });

  test('quiesces in-flight auto-mount: onChange and doRefresh are not called after stop', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        },
      ],
    });
    mockDrives = [unmountedPartitionDisk];

    // Keep the mount exec pending so the mountPartitionWithRetry loop is
    // in-flight when stop() is called.
    const mountOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      mountOperation.promise as PromiseWithChild<ExecResult>
    );

    const onChangeCalls: number[] = [];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger, {
      onChange: () => onChangeCalls.push(Date.now()),
    });

    // Trigger auto-mount by refreshing.
    await multiUsbDrive.refresh();

    // Clear onChange calls from the refresh above.
    onChangeCalls.length = 0;
    getAllUsbDrivesMock.mockClear();

    // Stop before the mount exec resolves.
    multiUsbDrive.stop();

    // Resolve the pending mount exec — the loop should not resume.
    mountOperation.resolve({ stdout: '', stderr: '' });
    await sleep(50);

    // Neither onChange nor doRefresh (getAllUsbDrives) should have been called
    // after stop().
    expect(onChangeCalls).toHaveLength(0);
    expect(getAllUsbDrivesMock).not.toHaveBeenCalled();
  });
});

describe('ejectDrive', () => {
  test('unmounts all mounted partitions and logs events', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount

    await multiUsbDrive.ejectDrive('/dev/sdb');

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/vx/usb-drive-sdb1',
    ]);

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjectInit,
      expect.any(String)
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    multiUsbDrive.stop();
  });

  test('shows partitions as unmounting during eject', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    const unmountOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      unmountOperation.promise as PromiseWithChild<ExecResult>
    );

    const ejectPromise = multiUsbDrive.ejectDrive('/dev/sdb');

    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toMatchObject({
      type: 'unmounting',
      mountPoint: '/media/vx/usb-drive-sdb1',
    });

    unmountOperation.resolve({ stdout: '', stderr: '' });
    await ejectPromise;

    multiUsbDrive.stop();
  });

  test('waits for in-progress partition mount to complete before unmounting', async () => {
    vi.useFakeTimers();

    try {
      const unmountedPartitionDisk = makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: undefined,
          },
        ],
      });
      const mountedDisk = makeDisk();

      const mountOperation = deferred<ExecResult>();
      execMock
        .mockReturnValueOnce(
          mountOperation.promise as PromiseWithChild<ExecResult>
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount

      // Call 1: factory doRefresh — triggers auto-mount
      // Call 2: mountPartitionWithRetry poll — mounts the partition
      // Call 3: ejectDrive's final doRefresh
      getAllUsbDrivesMock
        .mockResolvedValueOnce([unmountedPartitionDisk])
        .mockResolvedValueOnce([mountedDisk])
        .mockResolvedValueOnce([]);

      const logger = mockLogger({ fn: vi.fn });
      const multiUsbDrive = detectMultiUsbDrive(logger);

      // Flush microtasks: factory doRefresh runs, auto-mount starts (exec pending)
      await vi.advanceTimersByTimeAsync(0);

      // Start eject — the while loop sleeps because partitionAction has 'mounting'
      const ejectPromise = multiUsbDrive.ejectDrive('/dev/sdb');

      // Resolve mount exec so mountPartitionWithRetry completes during the sleep
      mountOperation.resolve({ stdout: '', stderr: '' });

      // Advance 100ms: eject's sleep fires; by then, mountPartitionWithRetry has
      // polled cachedDrives, found the mountpoint, and cleared partitionAction
      await vi.advanceTimersByTimeAsync(100);
      await ejectPromise;

      // Eject must have unmounted the partition that finished mounting during the wait
      expect(execMock).toHaveBeenCalledWith('sudo', [
        '-n',
        `${MOUNT_SCRIPT_PATH}/unmount.sh`,
        '/media/vx/usb-drive-sdb1',
      ]);

      multiUsbDrive.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test('shows already-unmounted partition as ejected while ejecting', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: undefined,
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    // Start eject without awaiting — driveAction is set to 'ejecting' synchronously
    // before the first await, so getDrives() can observe the in-progress state.
    const ejectPromise = multiUsbDrive.ejectDrive('/dev/sdb');

    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
      type: 'ejected',
    });

    await ejectPromise;

    multiUsbDrive.stop();
  });

  test('skips unmount for unmounted partitions', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: undefined,
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    await multiUsbDrive.ejectDrive('/dev/sdb');

    expect(execMock).not.toHaveBeenCalledWith(
      'sudo',
      expect.arrayContaining(['unmount.sh'])
    );

    multiUsbDrive.stop();
  });

  test('logs failure and rethrows when unmount throws', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockRejectedValueOnce(new Error('unmount failed'));

    await expect(multiUsbDrive.ejectDrive('/dev/sdb')).rejects.toThrow(
      'unmount failed'
    );

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveEjected,
      expect.any(String),
      expect.objectContaining({ disposition: 'failure' })
    );

    multiUsbDrive.stop();
  });

  test('does nothing if action already in progress', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    const firstEjectOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      firstEjectOperation.promise as PromiseWithChild<ExecResult>
    );

    const firstEject = multiUsbDrive.ejectDrive('/dev/sdb');
    await multiUsbDrive.ejectDrive('/dev/sdb'); // no-op

    firstEjectOperation.resolve({ stdout: '', stderr: '' });
    await firstEject;

    // Only one unmount call (from the first eject)
    expect(execMock).toHaveBeenCalledTimes(1);

    multiUsbDrive.stop();
  });

  test('shows partitions as ejected after eject completes', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount

    await multiUsbDrive.ejectDrive('/dev/sdb');

    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
      type: 'ejected',
    });

    multiUsbDrive.stop();
  });
});

describe('formatDrive', () => {
  test('unmounts partitions, formats drive with existing label, and logs events', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // format

    await multiUsbDrive.formatDrive('/dev/sdb', 'fat32');

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/unmount.sh`,
      '/media/vx/usb-drive-sdb1',
    ]);
    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_fat32.sh`,
      '/dev/sdb',
      'VxUSB-ABCDE', // preserves existing VxUSB label
    ]);

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatInit,
      expect.any(String)
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    multiUsbDrive.stop();
  });

  test('formats drive as ext4 when fstype is ext4', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // format

    await multiUsbDrive.formatDrive('/dev/sdb', 'ext4');

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/format_ext4.sh`,
      '/dev/sdb',
      'VxUSB-ABCDE',
    ]);

    multiUsbDrive.stop();
  });

  test('shows partitions as ejected during format', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    const formatOperation = deferred<ExecResult>();
    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount
    execMock.mockReturnValueOnce(
      formatOperation.promise as PromiseWithChild<ExecResult>
    );

    const formatPromise = multiUsbDrive.formatDrive('/dev/sdb', 'fat32');

    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
      type: 'ejected',
    });

    formatOperation.resolve({ stdout: '', stderr: '' });
    await formatPromise;

    multiUsbDrive.stop();
  });

  test('waits for in-progress partition mount to complete before unmounting', async () => {
    vi.useFakeTimers();

    try {
      const unmountedPartitionDisk = makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: 'VxUSB-ABCDE',
          },
        ],
      });
      const mountedDisk = makeDisk();

      const mountOperation = deferred<ExecResult>();
      execMock
        .mockReturnValueOnce(
          mountOperation.promise as PromiseWithChild<ExecResult>
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // unmount
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // format

      // Call 1: factory doRefresh — triggers auto-mount
      // Call 2: mountPartitionWithRetry poll — finds mountpoint
      // Call 3: formatDrive's final doRefresh
      getAllUsbDrivesMock
        .mockResolvedValueOnce([unmountedPartitionDisk])
        .mockResolvedValueOnce([mountedDisk])
        .mockResolvedValueOnce([]);

      const logger = mockLogger({ fn: vi.fn });
      const multiUsbDrive = detectMultiUsbDrive(logger);

      // Flush microtasks: factory doRefresh runs, auto-mount starts (exec pending)
      await vi.advanceTimersByTimeAsync(0);

      // Start format — the while loop sleeps because partitionAction has 'mounting'
      const formatPromise = multiUsbDrive.formatDrive('/dev/sdb', 'fat32');

      // Resolve mount exec so mountPartitionWithRetry completes during the sleep
      mountOperation.resolve({ stdout: '', stderr: '' });

      // Advance 100ms: format's sleep fires; by then, mountPartitionWithRetry has
      // polled cachedDrives, found the mountpoint, and cleared partitionAction
      await vi.advanceTimersByTimeAsync(100);
      await formatPromise;

      // Format must have unmounted the partition that finished mounting during the wait
      expect(execMock).toHaveBeenCalledWith('sudo', [
        '-n',
        `${MOUNT_SCRIPT_PATH}/unmount.sh`,
        '/media/vx/usb-drive-sdb1',
      ]);

      multiUsbDrive.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test('generates new VxUSB label if existing label does not match pattern', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'exfat',
            fsver: '1.0',
            label: 'MY-DRIVE',
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // format (no unmount needed)

    await multiUsbDrive.formatDrive('/dev/sdb', 'fat32');

    const formatArgs = execMock.mock.calls.find((c) =>
      (c[1] as string[]).some((a) => a.includes('format_fat32.sh'))
    )?.[1] as string[];
    const label = formatArgs[formatArgs.length - 1];
    expect(label).toMatch(/^VxUSB-[A-Z0-9]{5}$/);

    multiUsbDrive.stop();
  });

  test('generates new label for drive with no partitions', async () => {
    mockDrives = [makeDisk({ partitions: [] })];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // format

    await multiUsbDrive.formatDrive('/dev/sdb', 'fat32');

    const formatArgs = execMock.mock.calls.find((c) =>
      (c[1] as string[]).some((a) => a.includes('format_fat32.sh'))
    )?.[1] as string[];
    const label = formatArgs[formatArgs.length - 1];
    expect(label).toMatch(/^VxUSB-[A-Z0-9]{5}$/);

    multiUsbDrive.stop();
  });

  test('logs failure and rethrows when format throws', async () => {
    mockDrives = [makeDisk({ partitions: [] })];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockRejectedValueOnce(new Error('format failed'));

    await expect(
      multiUsbDrive.formatDrive('/dev/sdb', 'fat32')
    ).rejects.toThrow('format failed');

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({ disposition: 'failure' })
    );

    multiUsbDrive.stop();
  });

  test('does nothing if action already in progress', async () => {
    mockDrives = [makeDisk({ partitions: [] })];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    const formatOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      formatOperation.promise as PromiseWithChild<ExecResult>
    );

    const firstFormat = multiUsbDrive.formatDrive('/dev/sdb', 'fat32');
    await multiUsbDrive.formatDrive('/dev/sdb', 'fat32'); // no-op

    formatOperation.resolve({ stdout: '', stderr: '' });
    await firstFormat;

    expect(execMock).toHaveBeenCalledTimes(1);

    multiUsbDrive.stop();
  });
});

describe('sync', () => {
  test('syncs a mounted partition', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' });

    await multiUsbDrive.sync('/dev/sdb1');

    expect(execMock).toHaveBeenCalledWith('sync', [
      '-f',
      '/media/vx/usb-drive-sdb1',
    ]);

    multiUsbDrive.stop();
  });

  test('does nothing if partition is not mounted', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: undefined,
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    await multiUsbDrive.sync('/dev/sdb1');

    const { calls } = execMock.mock;
    for (const args of calls) {
      expect(args).not.toContain('sync');
    }

    multiUsbDrive.stop();
  });

  test('does nothing if drive not found', async () => {
    mockDrives = [];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.sync('/dev/sdb1');

    expect(execMock).not.toHaveBeenCalled();

    multiUsbDrive.stop();
  });
});

describe('autoMount', () => {
  test('auto-mounts FAT32 partitions and logs mount events', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        },
      ],
    });
    const mountedDisk = makeDisk(); // has mountpoint

    mockDrives = [unmountedPartitionDisk];
    const logger = mockLogger({ fn: vi.fn });

    // On mount, update the drives to reflect the mount
    execMock.mockImplementation((_cmd, args) => {
      if (args?.includes(`${MOUNT_SCRIPT_PATH}/mount.sh`)) {
        mockDrives = [mountedDisk];
      }
      return Promise.resolve({
        stdout: '',
        stderr: '',
      }) as unknown as PromiseWithChild<ExecResult>;
    });

    const multiUsbDrive = detectMultiUsbDrive(logger);

    await vi.waitFor(
      () => {
        const drives = multiUsbDrive.getDrives();
        expect(drives.length).toEqual(1);
        expect(drives[0]?.partitions[0]?.mount.type).toEqual('mounted');
      },
      { timeout: 2000 }
    );

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/mount.sh`,
      '/dev/sdb1',
    ]);

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveMountInit,
      expect.any(String)
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveMounted,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    multiUsbDrive.stop();
  });

  test('auto-mounts ext4 partitions', async () => {
    const unmountedExt4Disk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'ext4',
          fsver: '1.0',
          label: 'VxUSB-ABCDE',
        },
      ],
    });
    const mountedExt4Disk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: '/media/vx/usb-drive-sdb1',
          fstype: 'ext4',
          fsver: '1.0',
          label: 'VxUSB-ABCDE',
        },
      ],
    });

    mockDrives = [unmountedExt4Disk];
    const logger = mockLogger({ fn: vi.fn });

    execMock.mockImplementation((_cmd, args) => {
      if (args?.includes(`${MOUNT_SCRIPT_PATH}/mount.sh`)) {
        mockDrives = [mountedExt4Disk];
      }
      return Promise.resolve({
        stdout: '',
        stderr: '',
      }) as unknown as PromiseWithChild<ExecResult>;
    });

    const multiUsbDrive = detectMultiUsbDrive(logger);

    await vi.waitFor(
      () => {
        const drives = multiUsbDrive.getDrives();
        expect(drives.length).toEqual(1);
        expect(drives[0]?.partitions[0]?.mount.type).toEqual('mounted');
      },
      { timeout: 2000 }
    );

    expect(execMock).toHaveBeenCalledWith('sudo', [
      '-n',
      `${MOUNT_SCRIPT_PATH}/mount.sh`,
      '/dev/sdb1',
    ]);

    multiUsbDrive.stop();
  });

  test('logs mount failure when exec throws', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        },
      ],
    });

    mockDrives = [unmountedPartitionDisk];
    const logger = mockLogger({ fn: vi.fn });

    execMock.mockRejectedValueOnce(new Error('mount failed'));

    const multiUsbDrive = detectMultiUsbDrive(logger);

    await vi.waitFor(
      () => {
        expect(logger.log).toHaveBeenCalledWith(
          LogEventId.UsbDriveMountInit,
          expect.any(String)
        );
        expect(logger.log).toHaveBeenCalledWith(
          LogEventId.UsbDriveMounted,
          expect.any(String),
          expect.objectContaining({ disposition: 'failure' })
        );
      },
      { timeout: 2000 }
    );

    multiUsbDrive.stop();
  });

  test('shows partition as mounting while auto-mount exec is pending', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: undefined,
        },
      ],
    });

    const mountOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      mountOperation.promise as PromiseWithChild<ExecResult>
    );

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    mockDrives = [unmountedPartitionDisk];
    await multiUsbDrive.refresh();

    // partitionAction has 'mounting' for /dev/sdb1 while exec is pending
    expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
      type: 'mounting',
    });

    mountOperation.resolve({ stdout: '', stderr: '' });
    mockDrives = [makeDisk()];
    await vi.waitFor(
      () =>
        multiUsbDrive.getDrives()[0]?.partitions[0]?.mount.type === 'mounted'
    );

    multiUsbDrive.stop();
  });

  test('calls onChange after partitionAction is cleared so listeners see mounted state', async () => {
    const unmountedPartitionDisk = makeDisk({
      partitions: [
        {
          devPath: '/dev/sdb1',
          mountpoint: undefined,
          fstype: 'vfat',
          fsver: 'FAT32',
          label: 'VxUSB-ABCDE',
        },
      ],
    });

    execMock.mockImplementation((_cmd, args) => {
      if ((args as string[])?.includes(`${MOUNT_SCRIPT_PATH}/mount.sh`)) {
        mockDrives = [makeDisk()];
      }
      return Promise.resolve({
        stdout: '',
        stderr: '',
      }) as unknown as PromiseWithChild<ExecResult>;
    });

    const mountStatesOnChange: string[] = [];
    const logger = mockLogger({ fn: vi.fn });
    mockDrives = [unmountedPartitionDisk];
    const multiUsbDrive = detectMultiUsbDrive(logger, {
      onChange: () => {
        const mount = multiUsbDrive.getDrives()[0]?.partitions[0]?.mount;
        if (mount) mountStatesOnChange.push(mount.type);
      },
    });

    // Wait until onChange is called with the drive in mounted state.
    // Without the onChange call in mountPartitionWithRetry's finally block,
    // this never happens because the last doRefresh inside the poll loop fires
    // onChange while partitionAction still has 'mounting' set.
    await vi.waitFor(
      () => {
        expect(mountStatesOnChange).toContain('mounted');
      },
      { timeout: 2000 }
    );

    multiUsbDrive.stop();
  });

  test('retries polling after sleep if mountpoint does not register immediately', async () => {
    vi.useFakeTimers();

    try {
      const unmountedPartitionDisk = makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: undefined,
          },
        ],
      });

      // Call 1 (factory doRefresh): unmounted — triggers auto-mount
      // Call 2 (first retry poll): still unmounted — triggers sleep
      // Call 3 (second retry poll, after sleep): mounted — breaks loop
      getAllUsbDrivesMock
        .mockResolvedValueOnce([unmountedPartitionDisk])
        .mockResolvedValueOnce([unmountedPartitionDisk])
        .mockResolvedValueOnce([makeDisk()]);

      execMock.mockResolvedValue({ stdout: '', stderr: '' });

      const logger = mockLogger({ fn: vi.fn });
      const multiUsbDrive = detectMultiUsbDrive(logger);

      // Advance by 100ms (MOUNT_RETRY_INTERVAL_MS) to flush all microtasks and
      // trigger the sleep timer, then flush the final poll microtasks.
      await vi.advanceTimersByTimeAsync(100);

      expect(multiUsbDrive.getDrives()[0]?.partitions[0]?.mount).toEqual({
        type: 'mounted',
        mountPoint: '/media/vx/usb-drive-sdb1',
      });

      multiUsbDrive.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test('logs timeout failure when mount exec succeeds but mountpoint never registers', async () => {
    vi.useFakeTimers();

    try {
      const unmountedPartitionDisk = makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: 'VxUSB-ABCDE',
          },
        ],
      });

      // exec succeeds but the partition never shows a mountpoint
      mockDrives = [unmountedPartitionDisk];
      execMock.mockResolvedValue({ stdout: '', stderr: '' });

      const logger = mockLogger({ fn: vi.fn });
      const multiUsbDrive = detectMultiUsbDrive(logger);

      // Advance past MOUNT_TIMEOUT_MS (5000ms) to exhaust the polling loop
      await vi.advanceTimersByTimeAsync(5200);

      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveMountInit,
        expect.any(String)
      );
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveMounted,
        expect.any(String),
        expect.objectContaining({ disposition: 'failure' })
      );

      multiUsbDrive.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test('does not auto-mount while a drive action is in progress', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    // Start eject with a pending unmount so driveAction stays set while we
    // trigger the watcher (ejectState is not yet set at this point).
    const unmountOperation = deferred<ExecResult>();
    execMock.mockReturnValueOnce(
      unmountOperation.promise as PromiseWithChild<ExecResult>
    );

    const ejectPromise = multiUsbDrive.ejectDrive('/dev/sdb');

    // Watcher fires while driveAction === 'ejecting' but ejectState is not set.
    // doAutoMount must return early at the driveAction check (line 190).
    capturedWatcherCallback?.();
    await sleep(0);

    unmountOperation.resolve({ stdout: '', stderr: '' });
    await ejectPromise;

    // Only one exec call: the unmount (no spurious remount attempts)
    expect(execMock).toHaveBeenCalledTimes(1);

    multiUsbDrive.stop();
  });

  test('does not auto-mount drives that were ejected', async () => {
    mockDrives = [makeDisk()];
    const logger = mockLogger({ fn: vi.fn });

    execMock.mockResolvedValueOnce({ stdout: '', stderr: '' }); // unmount for eject

    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    // Eject the drive
    await multiUsbDrive.ejectDrive('/dev/sdb');

    // Now the drive reappears unmounted
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'vfat',
            fsver: 'FAT32',
            label: 'VxUSB-ABCDE',
          },
        ],
      }),
    ];
    vi.clearAllMocks(); // clear exec call history

    await multiUsbDrive.refresh();

    // Short wait to ensure no async auto-mount triggers
    await sleep(50);

    expect(execMock).not.toHaveBeenCalledWith(
      'sudo',
      expect.arrayContaining(['mount.sh'])
    );

    multiUsbDrive.stop();
  });

  test('does not auto-mount non-FAT32 partitions', async () => {
    mockDrives = [
      makeDisk({
        partitions: [
          {
            devPath: '/dev/sdb1',
            mountpoint: undefined,
            fstype: 'exfat',
            fsver: undefined,
            label: undefined,
          },
        ],
      }),
    ];
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive(logger);

    await multiUsbDrive.refresh();

    await sleep(50);

    expect(execMock).not.toHaveBeenCalledWith(
      'sudo',
      expect.arrayContaining(['mount.sh'])
    );

    multiUsbDrive.stop();
  });
});

import { deferred, Optional, sleep } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LogEventId, mockLogger } from '@votingworks/logging';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { SimulatedUsbPlatform } from './mocks/simulated_usb_platform';
import { detectMultiUsbDrive } from './multi_usb_drive';
import {
  UsbDiskDevPathSchema,
  UsbPartitionDevPathSchema,
  UsbPartitionInfo,
  UsbPartitionMount,
} from './types';

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.decode('/dev/sdb1');
const devsdc = UsbDiskDevPathSchema.decode('/dev/sdc');

describe('getDrives', () => {
  test('returns empty array initially', () => {
    const logger = mockLogger({ fn: vi.fn });
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    expect(multiUsbDrive.getDrives()).toEqual([]);
    multiUsbDrive.stop();
  });

  test('returns drives after initial refresh resolves', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();

    await vi.waitFor(() => {
      const [drive] = multiUsbDrive.getDrives();
      expect(drive).toMatchObject({
        diskPath: devsdb,
      });
      expect(drive?.partition).toMatchObject<Partial<UsbPartitionInfo>>({
        diskPath: devsdb,
        partPath: devsdb1,
        mount: UsbPartitionMount.mounted(platform.storagePath(devsdb)),
      });
    });

    multiUsbDrive.stop();
  });

  test('reports a supported partition as unmounted once auto-mount fails', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    // Fail the auto-mount so the partition settles back to unmounted rather
    // than transitioning to mounted.
    platform.faults.failNext('mountPartition', new Error('mount failed'));

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await vi.waitFor(() => {
      expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
        UsbPartitionMount.unmounted()
      );
    });

    multiUsbDrive.stop();
  });

  test('returns empty partitions for unformatted drive', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: undefined });
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()[0]?.partition).toBeUndefined();

    multiUsbDrive.stop();
  });

  test('returns multiple drives', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.createDrive({ diskPath: devsdc, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    platform.insertDrive(devsdc);
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();

    await vi.waitFor(() => {
      expect(multiUsbDrive.getDrives()).toHaveLength(2);
    });

    multiUsbDrive.stop();
  });
});

describe('refresh', () => {
  test('updates the cached drives', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    expect(multiUsbDrive.getDrives()).toHaveLength(0);

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();

    expect(multiUsbDrive.getDrives()).toHaveLength(1);

    multiUsbDrive.stop();
  });

  test('calls change listeners on first refresh and when state changes, but not on no-op refreshes', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const onChange = vi.fn();
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    multiUsbDrive.addListener(onChange);

    // Initial refresh fires onChange (first refresh always fires)
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(1); // factory doRefresh (first=true)

    // Refresh with same state — should NOT fire onChange
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Refresh with new state — should fire onChange
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(2);

    // Removed listeners no longer fire
    multiUsbDrive.removeListener(onChange);
    platform.removeDrive(devsdb);
    await multiUsbDrive.refresh();
    expect(onChange).toHaveBeenCalledTimes(2);

    multiUsbDrive.stop();
  });

  test('notifies listeners when ejecting an already-unmounted drive', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    const logger = mockLogger({ fn: vi.fn });

    // Fail the auto-mount so the partition settles at unmounted.
    platform.faults.failNext('mountPartition', new Error('mount failed'));

    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    await vi.waitFor(() => {
      expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
        UsbPartitionMount.unmounted()
      );
    });

    // Ejecting changes only derived state (the platform snapshot is
    // unchanged), but listeners must still hear about it.
    const onChange = vi.fn();
    multiUsbDrive.addListener(onChange);
    await multiUsbDrive.ejectDrive(devsdb);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.ejected()
    );

    multiUsbDrive.stop();
  });

  test('clears eject state for drives that were physically removed', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();
    await multiUsbDrive.ejectDrive(devsdb);

    // Drive is physically removed
    platform.removeDrive(devsdb);
    await multiUsbDrive.refresh();

    // Drive no longer in the list
    expect(multiUsbDrive.getDrives()).toHaveLength(0);

    // Drive re-plugged — eject state should be cleared
    platform.insertDrive(devsdb);
    await multiUsbDrive.refresh();
    expect(multiUsbDrive.getDrives()).toHaveLength(1);

    multiUsbDrive.stop();
  });
});

describe('ejectDrive', () => {
  test('unmounts all mounted partitions and logs events', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();
    await multiUsbDrive.ejectDrive(devsdb);

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

  test('logs failure and rethrows when unmount throws', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();
    platform.faults.failNext('unmountPartition', new Error('unmount failed'));

    await expect(multiUsbDrive.ejectDrive(devsdb)).rejects.toThrow(
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
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    vi.spyOn(platform, 'unmountPartition');

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();

    const firstEject = multiUsbDrive.ejectDrive(devsdb);
    await multiUsbDrive.ejectDrive(devsdb); // no-op
    await firstEject;

    // Only one unmount call (from the first eject)
    expect(platform.unmountPartition).toHaveBeenCalledTimes(1);

    multiUsbDrive.stop();
  });
});

describe('formatDrive', () => {
  test('unmounts partitions, formats drive with existing label, and logs events', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({
      diskPath: devsdb,
      fstype: 'fat32',
      label: 'VxUSB-ABCDE',
    });
    platform.insertDrive(devsdb);

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();
    await multiUsbDrive.formatDrive(devsdb, 'fat32');

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatInit,
      expect.any(String)
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({ disposition: 'success' })
    );

    expect(platform.getSimulatedDrives()[0]?.partition?.label).toEqual(
      'VxUSB-ABCDE'
    );

    multiUsbDrive.stop();
  });

  test('formats drive as ext4 when fstype is ext4', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    platform.createDrive({ diskPath: devsdb });
    platform.insertDrive(devsdb);

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    await multiUsbDrive.refresh();
    await multiUsbDrive.formatDrive(devsdb, 'ext4');

    expect(platform.getSimulatedDrives()[0]?.partition?.fstype).toEqual('ext4');

    multiUsbDrive.stop();
  });

  test('generates new VxUSB label if existing label does not match pattern', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({
      diskPath: devsdb,
      fstype: 'fat32',
      label: 'MY-LABEL',
    });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();
    await multiUsbDrive.formatDrive(devsdb, 'fat32');

    expect(platform.getSimulatedDrives()[0]?.partition?.label).toMatch(
      /^VxUSB-[A-Z0-9]{5}$/
    );

    multiUsbDrive.stop();
  });

  test('generates new label for drive with no partitions', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb, label: 'MY-LABEL' });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();
    await multiUsbDrive.formatDrive(devsdb, 'fat32');

    expect(platform.getSimulatedDrives()[0]?.partition?.label).toMatch(
      /^VxUSB-[A-Z0-9]{5}$/
    );

    multiUsbDrive.stop();
  });

  test('logs failure and rethrows when format throws', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();
    platform.faults.failNext('formatDrive', new Error('format failed'));

    await expect(multiUsbDrive.formatDrive(devsdb, 'fat32')).rejects.toThrow(
      'format failed'
    );

    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.UsbDriveFormatted,
      expect.any(String),
      expect.objectContaining({ disposition: 'failure' })
    );

    multiUsbDrive.stop();
  });

  test('does nothing if action already in progress', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    vi.spyOn(platform, 'formatDrive');

    platform.createDrive({ diskPath: devsdb });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();

    const firstFormat = multiUsbDrive.formatDrive(devsdb, 'fat32');
    await multiUsbDrive.formatDrive(devsdb, 'fat32'); // no-op
    await firstFormat;

    expect(platform.formatDrive).toHaveBeenCalledTimes(1);

    multiUsbDrive.stop();
  });
});

describe('sync', () => {
  test('syncs a mounted partition', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();
    await multiUsbDrive.sync(devsdb1);

    multiUsbDrive.stop();
  });
});

describe('autoMount', () => {
  test('auto-mounts FAT32 partitions', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    await vi.waitFor(
      () => {
        const drives = multiUsbDrive.getDrives();
        expect(drives).toHaveLength(1);
        expect(drives[0]?.partition?.mount).toEqual(
          UsbPartitionMount.mounted(expect.any(String))
        );
      },
      { timeout: 2000 }
    );

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
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    platform.createDrive({ diskPath: devsdb, fstype: 'ext4' });
    platform.insertDrive(devsdb);

    await vi.waitFor(
      () => {
        const drives = multiUsbDrive.getDrives();
        expect(drives).toHaveLength(1);
        expect(drives[0]?.partition?.mount).toEqual(
          UsbPartitionMount.mounted(expect.any(String))
        );
      },
      { timeout: 2000 }
    );

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

  test('retries while the mount has not completed', async () => {
    vi.useFakeTimers();

    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    const getDrives = vi.fn().mockResolvedValue([]);
    vi.spyOn(platform, 'getDrives')
      .mockImplementationOnce(getDrives)
      .mockImplementationOnce(getDrives)
      .mockImplementationOnce(getDrives);

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    await vi.waitFor(async () => {
      await vi.advanceTimersToNextTimerAsync();
      const drives = multiUsbDrive.getDrives();
      expect(drives).toHaveLength(1);
      expect(drives[0]?.partition?.mount).toEqual(
        UsbPartitionMount.mounted(expect.any(String))
      );
    });

    expect(getDrives).toHaveBeenCalledTimes(3);
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
    vi.useRealTimers();
  });

  test('logs mount failure when exec throws', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);
    platform.faults.failNext('mountPartition', new Error('mount failed'));

    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

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

  test('shows partition as mounting and then mounted', async () => {
    const states: Array<Optional<UsbPartitionMount>> = [];
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());

    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    multiUsbDrive.addListener(() => {
      states.push(
        ...multiUsbDrive.getDrives().map((drive) => drive.partition?.mount)
      );
    });

    platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
    platform.insertDrive(devsdb);

    await multiUsbDrive.refresh();

    await vi.waitFor(() => {
      expect(states).toContainEqual(UsbPartitionMount.mounting());
      expect(states).toContainEqual(
        UsbPartitionMount.mounted(platform.storagePath(devsdb))
      );
    });

    // Verify calling `stop()` does not call listeners anymore.
    states.length = 0;
    multiUsbDrive.stop();

    // Platform listeners still work, but the multi-USB drive interface should
    // not be listening for changes.
    const { promise, resolve } = deferred<void>();
    platform.watchChanges(resolve);
    platform.createDrive({ diskPath: devsdc, fstype: 'fat32' });
    platform.insertDrive(devsdc);
    await promise;
    expect(states).toHaveLength(0);
  });
});

describe('stop', () => {
  test('refresh after stop does not query the platform', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    await multiUsbDrive.refresh();

    multiUsbDrive.stop();

    // A refresh requested after stop returns early, before reading the platform.
    const getDrives = vi.spyOn(platform, 'getDrives');
    await multiUsbDrive.refresh();

    expect(getDrives).not.toHaveBeenCalled();
  });

  test('does not auto-mount when stopped mid-refresh', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });
    await multiUsbDrive.refresh();

    const mountPartition = vi.spyOn(platform, 'mountPartition');

    // Stop while the refresh is in flight: the refresh itself passes its own
    // stopped check, but the subsequent auto-mount must observe the stop and
    // bail rather than mounting after teardown.
    vi.spyOn(platform, 'getDrives').mockImplementationOnce(() => {
      multiUsbDrive.stop();
      return Promise.resolve([
        {
          diskPath: devsdb,
          partition: { partPath: devsdb1, fstype: 'fat32' },
        },
      ]);
    });

    await multiUsbDrive.refresh();

    expect(mountPartition).not.toHaveBeenCalled();
  });
});

describe('integration', () => {
  // End-to-end test against a real `SimulatedUsbPlatform` that performs actual
  // filesystem I/O. This guards the full `UsbPlatform` contract — that data
  // written through a mounted partition survives an eject and is wiped by a
  // format, and that unmount/sync are addressed by mountpoint — which the
  // method-level tests above don't exercise.
  test('full lifecycle: insert → auto-mount → write → sync → eject → format → remove → re-insert', async () => {
    const platform = new SimulatedUsbPlatform(makeTemporaryDirectory());
    const logger = mockLogger({ fn: vi.fn });
    const multiUsbDrive = detectMultiUsbDrive({ logger, platform });

    try {
      await multiUsbDrive.refresh();
      expect(multiUsbDrive.getDrives()).toEqual([]);

      platform.createDrive({
        diskPath: devsdb,
        fstype: 'fat32',
        label: 'VxUSB-ABCDE',
      });
      platform.insertDrive(devsdb);
      await multiUsbDrive.refresh();

      const mountpoint = platform.storagePath(devsdb);
      await vi.waitFor(
        () => {
          expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
            UsbPartitionMount.mounted(mountpoint)
          );
        },
        { timeout: 2000 }
      );
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveMounted,
        expect.any(String),
        expect.objectContaining({ disposition: 'success' })
      );

      // Write data through the mounted filesystem and flush it
      await writeFile(join(mountpoint, 'README'), 'hello');
      await multiUsbDrive.sync(devsdb1);

      // Eject unmounts via the platform and reports the partition as ejected
      await multiUsbDrive.ejectDrive(devsdb);
      expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
        UsbPartitionMount.ejected()
      );
      expect(
        platform.getSimulatedDrives()[0]?.partition?.mountpoint
      ).toBeUndefined();
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveEjected,
        expect.any(String),
        expect.objectContaining({ disposition: 'success' })
      );

      // Ejecting preserves the drive's data and prevents auto-remount
      expect(existsSync(join(mountpoint, 'README'))).toEqual(true);
      await multiUsbDrive.refresh();
      await sleep(50);
      expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
        UsbPartitionMount.ejected()
      );

      // Format preserves the VxUSB label and wipes the drive's data
      await multiUsbDrive.formatDrive(devsdb, 'fat32');
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.UsbDriveFormatted,
        expect.any(String),
        expect.objectContaining({
          disposition: 'success',
          message: expect.stringContaining('VxUSB-ABCDE'),
        })
      );
      expect(platform.getSimulatedDrives()[0]?.partition?.label).toEqual(
        'VxUSB-ABCDE'
      );
      expect(existsSync(join(mountpoint, 'README'))).toEqual(false);

      // Unplugging the drive is detected via the platform watcher (no explicit
      // refresh) and the drive disappears
      platform.removeDrive(devsdb);
      await vi.waitFor(
        () => {
          expect(multiUsbDrive.getDrives()).toEqual([]);
        },
        { timeout: 2000 }
      );

      // Re-inserting clears the eject state and auto-mounts again
      platform.insertDrive(devsdb);
      await multiUsbDrive.refresh();
      await vi.waitFor(
        () => {
          expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
            UsbPartitionMount.mounted(mountpoint)
          );
        },
        { timeout: 2000 }
      );
    } finally {
      multiUsbDrive.stop();
    }
  });
});

import {
  assert,
  assertDefined,
  Deferred,
  deferred,
  extractErrorMessage,
  iter,
  MaybePromise,
  Optional,
  sleep,
} from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import makeDebug from 'debug';
import { createMockFileMultiUsbDrive } from './mocks/file_usb_drive';
import {
  UsbDiskDevPath,
  UsbDriveFilesystemType,
  UsbDriveInfo,
  UsbPartitionDevPath,
  UsbPartitionMount,
} from './types';
import {
  RealUsbPlatform,
  UsbPlatform,
  UsbPlatformDrive,
  UsbPlatformPartition,
} from './usb_platform';

const VX_USB_LABEL_REGEXP = /^VxUSB-[A-Z0-9]{5}$/i;

const debug = makeDebug('usb-drive:multi');

const MOUNT_TIMEOUT_MS = 5_000;
const MOUNT_RETRY_INTERVAL_MS = 100;

function generateVxUsbLabel(previousLabel?: string): string {
  if (previousLabel && VX_USB_LABEL_REGEXP.test(previousLabel)) {
    return previousLabel;
  }

  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let label = 'VxUSB-';
  for (let i = 0; i < 5; i += 1) {
    label += assertDefined(CHARS[Math.floor(Math.random() * CHARS.length)]);
  }
  return label;
}

export interface MultiUsbDrive {
  getDrives(): UsbDriveInfo[];
  refresh(): Promise<void>;
  ejectDrive(diskPath: UsbDiskDevPath): Promise<void>;
  formatDrive(
    diskPath: UsbDiskDevPath,
    fstype: UsbDriveFilesystemType
  ): Promise<void>;
  sync(partPath: UsbPartitionDevPath): Promise<void>;
  stop(): void;
  addListener(listener: () => void): void;
  removeListener(listener: () => void): void;
}

/**
 * Manages a set of keyed async actions with at-most-one-at-a-time semantics per
 * key. Actions are deferred to `process.nextTick`, but the runner is considered
 * busy immediately.
 */
class KeyedTaskRunner<Key, Task> {
  private readonly tasks = new Map<Key, Task>();
  private readonly deferreds = new Map<Key, Deferred<void>>();

  /**
   * Schedules `action` for `key` if no action is already running for that key.
   * Returns a promise that settles when the action completes, or `undefined` if
   * the key is busy. The task label is set synchronously before the promise is
   * returned so callers can observe it immediately via {@link getTask}.
   */
  perform(
    key: Key,
    task: Task,
    action: () => MaybePromise<void>
  ): Optional<Promise<void>> {
    if (this.tasks.has(key)) return undefined;

    this.tasks.set(key, task);
    const d = deferred<void>();
    this.deferreds.set(key, d);

    // Defer execution so the task label is guaranteed to be set before any
    // action code runs. Without this, a direct `async` call would execute
    // synchronously up to its first `await`, which could complete the action
    // and clear the task before `perform` returns — making the task
    // unobservable to the caller.
    process.nextTick(async () => {
      let error: unknown;
      try {
        await action();
      } catch (e) {
        error = e;
      }

      this.tasks.delete(key);
      this.deferreds.delete(key);

      if (error) {
        d.reject(error);
      } else {
        d.resolve();
      }
    });
    return d.promise;
  }

  /** Returns the task label for `key`, or `undefined` if idle. */
  getTask(key: Key): Optional<Task> {
    return this.tasks.get(key);
  }

  /** Returns `true` if an action is running for `key`. */
  isBusy(key: Key): boolean {
    return this.tasks.has(key);
  }

  /**
   * Returns a promise that settles when the current action for `key` completes,
   * or resolves immediately if idle.
   */
  join(key: Key): Promise<void> {
    return this.deferreds.get(key)?.promise ?? Promise.resolve();
  }
}

export function detectMultiUsbDrive(
  logger: Logger,
  options?: { platform?: UsbPlatform }
): MultiUsbDrive {
  // An explicitly injected platform takes precedence over the ambient
  // USE_MOCK_USB_DRIVE flag.
  if (
    !options?.platform &&
    isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)
  ) {
    return createMockFileMultiUsbDrive();
  }

  const platform = options?.platform ?? new RealUsbPlatform();
  const listeners = new Set<() => void>();

  let stopped = false;
  let lastReportedState: Optional<string>;
  let cachedDrives: UsbPlatformDrive[] = [];

  // Per-drive eject state: cleared when the drive is no longer detected.
  const ejectedDrives = new Set<string>();

  // Per-drive action lock: 'ejecting' or 'formatting'.
  const driveAction = new KeyedTaskRunner<string, 'ejecting' | 'formatting'>();

  // Per-partition action lock: 'mounting'.
  const partitionAction = new KeyedTaskRunner<string, 'mounting'>();

  function onChange() {
    for (const listener of listeners) {
      listener();
    }
  }

  /**
   * Notifies listeners if the drive state visible through {@link getDrives}
   * has changed since the last notification. Compares the built drive infos —
   * not the raw platform snapshot — so transitions that only change derived
   * state (e.g. ejecting an already-unmounted drive) are still reported.
   */
  function notifyIfChanged() {
    const newState = JSON.stringify(cachedDrives.map(buildDriveInfo));
    if (newState === lastReportedState) return;
    lastReportedState = newState;
    onChange();
  }

  function computeMount(
    diskPath: UsbDiskDevPath,
    partition: UsbPlatformPartition
  ): UsbPartitionMount {
    const dAction = driveAction.getTask(diskPath);

    if (dAction === 'ejecting') {
      // Appears as unmounting (or ejected if already unmounted).
      return partition.mountpoint
        ? UsbPartitionMount.unmounting(partition.mountpoint)
        : UsbPartitionMount.ejected();
    }

    if (dAction === 'formatting') {
      return UsbPartitionMount.formatting();
    }

    if (partitionAction.getTask(partition.partPath) === 'mounting') {
      return UsbPartitionMount.mounting();
    }

    if (ejectedDrives.has(diskPath)) {
      return UsbPartitionMount.ejected();
    }

    if (partition.mountpoint) {
      return UsbPartitionMount.mounted(partition.mountpoint);
    }

    return UsbPartitionMount.unmounted();
  }

  function buildDriveInfo(drive: UsbPlatformDrive): UsbDriveInfo {
    if (!drive.partition) {
      return { diskPath: drive.diskPath };
    }
    return {
      diskPath: drive.diskPath,
      partition: {
        diskPath: drive.diskPath,
        partPath: drive.partition.partPath,
        fstype: drive.partition.fstype,
        label: drive.partition.label,
        mount: computeMount(drive.diskPath, drive.partition),
      },
    };
  }

  function mountPartitionWithRetry(
    diskPath: UsbDiskDevPath,
    partPath: UsbPartitionDevPath
  ): void {
    void partitionAction
      .perform(partPath, 'mounting', () =>
        doMountPartitionWithRetry(diskPath, partPath)
      )
      ?.then(() => {
        if (!stopped) notifyIfChanged();
      });
  }

  async function doMountPartitionWithRetry(
    diskPath: UsbDiskDevPath,
    partPath: UsbPartitionDevPath
  ): Promise<void> {
    try {
      await logger.logAsCurrentRole(LogEventId.UsbDriveMountInit);
      await platform.mountPartition(partPath);

      let mountpoint: Optional<string>;
      const deadline = Date.now() + MOUNT_TIMEOUT_MS;
      while (!stopped && Date.now() < deadline) {
        await doRefresh();
        mountpoint = cachedDrives.find((d) => d.diskPath === diskPath)
          ?.partition?.mountpoint;
        if (mountpoint) break;
        await sleep(MOUNT_RETRY_INTERVAL_MS);
      }

      await logger.logAsCurrentRole(
        LogEventId.UsbDriveMounted,
        mountpoint
          ? {
              disposition: 'success',
              message: `USB drive partition ${partPath} successfully auto-mounted at ${mountpoint}.`,
            }
          : {
              disposition: 'failure',
              message: `Timed out waiting for USB drive partition ${partPath} to mount.`,
              result: 'USB drive partition not mounted.',
            }
      );
    } catch (error) {
      debug(`auto-mount failed for ${partPath}: ${error}`);
      await logger.logAsCurrentRole(LogEventId.UsbDriveMounted, {
        disposition: 'failure',
        message: `Auto-mount failed for USB drive partition ${partPath}.`,
        error: extractErrorMessage(error),
        result: 'USB drive partition not mounted.',
      });
    }
  }

  function doAutoMount(drive: UsbPlatformDrive): void {
    if (stopped) return;
    if (ejectedDrives.has(drive.diskPath)) return;
    if (driveAction.isBusy(drive.diskPath)) return;
    if (!drive.partition || drive.partition.mountpoint) return;
    if (partitionAction.isBusy(drive.partition.partPath)) return;

    debug(`auto-mounting partition ${drive.partition.partPath}`);
    mountPartitionWithRetry(drive.diskPath, drive.partition.partPath);
  }

  async function doRefresh(): Promise<void> {
    if (stopped) return;
    // Every detected USB disk is included. `partition` is set only when the
    // disk has exactly one supported (FAT32/ext4) partition; otherwise the disk
    // appears with no partition (e.g. unformatted or unsupported drives).
    const newDrives = await platform.getDrives();

    // Clear eject state for drives that have been physically removed
    for (const devPath of ejectedDrives) {
      if (!newDrives.some((d) => d.diskPath === devPath)) {
        ejectedDrives.delete(devPath);
      }
    }

    cachedDrives = newDrives;

    for (const disk of newDrives) {
      doAutoMount(disk);
    }

    notifyIfChanged();
  }

  /**
   * Helper for operations that need to unmount all disk partitions first.
   * Returns the freshly-read disk.
   */
  async function unmountDrive(
    diskPath: UsbDiskDevPath
  ): Promise<UsbPlatformDrive> {
    const disk = cachedDrives.find((d) => d.diskPath === diskPath);
    assert(disk, `Drive not found: ${diskPath}`);
    if (!disk.partition) return disk;

    // Wait for any in-progress auto-mount of this partition to settle so we
    // unmount it rather than racing the mount.
    await partitionAction.join(disk.partition.partPath);

    const freshDisk = cachedDrives.find((d) => d.diskPath === diskPath);
    assert(freshDisk, `Drive not found: ${diskPath}`);
    if (freshDisk.partition?.mountpoint) {
      await platform.unmountPartition(freshDisk.partition.mountpoint);
    }
    return freshDisk;
  }

  const watcher = platform.watchChanges(() => {
    void doRefresh().catch((e) => debug(`background refresh failed: ${e}`));
  });
  void doRefresh().catch((e) => debug(`initial refresh failed: ${e}`));

  return {
    getDrives(): UsbDriveInfo[] {
      return cachedDrives.map(buildDriveInfo);
    },

    async refresh(): Promise<void> {
      await doRefresh();
    },

    async ejectDrive(diskPath: UsbDiskDevPath): Promise<void> {
      const result = driveAction.perform(diskPath, 'ejecting', async () => {
        await logger.logAsCurrentRole(LogEventId.UsbDriveEjectInit);
        try {
          await unmountDrive(diskPath);

          ejectedDrives.add(diskPath);
          await doRefresh();

          await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
            disposition: 'success',
            message: 'USB drive successfully ejected.',
          });
          debug(`Drive ${diskPath} ejected successfully`);
        } catch (error) {
          await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
            disposition: 'failure',
            message: 'USB drive failed to eject.',
            error: extractErrorMessage(error),
            result: 'USB drive not ejected.',
          });
          debug(`Drive ${diskPath} ejection failed: ${error}`);
          throw error;
        }
      });

      if (!result) {
        debug(`cannot eject ${diskPath}: action already in progress`);
        return;
      }

      await result;
    },

    async formatDrive(
      diskPath: UsbDiskDevPath,
      fstype: UsbDriveFilesystemType
    ): Promise<void> {
      const result = driveAction.perform(diskPath, 'formatting', async () => {
        await logger.logAsCurrentRole(LogEventId.UsbDriveFormatInit);
        try {
          const freshDisk = await unmountDrive(diskPath);

          // Determine label — reuse existing label if it matches VxUSB pattern
          const label = generateVxUsbLabel(freshDisk.partition?.label);

          debug(
            `formatting drive ${diskPath} as ${fstype} with label ${label}`
          );
          await platform.formatDrive(diskPath, fstype, label);
          ejectedDrives.add(diskPath); // prevent auto-remount
          await doRefresh();

          await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
            disposition: 'success',
            message: `USB drive successfully formatted with a single ${
              fstype === 'ext4' ? 'ext4' : 'FAT32'
            } volume named "${label}".`,
          });
          debug(`Drive ${diskPath} formatted successfully`);
        } catch (error) {
          await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
            disposition: 'failure',
            message: 'Failed to format USB drive.',
            error: extractErrorMessage(error),
            result: 'USB drive not formatted, error shown to user.',
          });
          debug(`Drive ${diskPath} format failed: ${error}`);
          throw error;
        }
      });

      if (!result) {
        debug(`cannot format ${diskPath}: action already in progress`);
        return;
      }

      await result;
    },

    async sync(partPath: UsbPartitionDevPath): Promise<void> {
      const partition = iter(cachedDrives)
        .filterMap((d) => d.partition)
        .find((p) => p.partPath === partPath);

      if (!partition?.mountpoint) {
        debug(`partition ${partPath} is not mounted, skipping sync`);
        return;
      }

      await platform.sync(partition.mountpoint);
    },

    stop(): void {
      stopped = true;
      watcher.stop();
      listeners.clear();
    },

    addListener(listener: () => void): void {
      listeners.add(listener);
    },

    removeListener(listener: () => void): void {
      listeners.delete(listener);
    },
  };
}

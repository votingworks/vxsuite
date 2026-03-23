import { join } from 'node:path';
import makeDebug from 'debug';
import {
  assert,
  assertDefined,
  Deferred,
  deferred,
  iter,
  MaybePromise,
  Optional,
  sleep,
  throwIllegalValue,
} from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { exec } from './exec';
import {
  getAllUsbDrives,
  UsbDiskDeviceInfo,
  UsbPartitionDeviceInfo,
  createBlockDeviceChangeWatcher,
} from './block_devices';
import { createMockFileMultiUsbDrive } from './mocks/file_usb_drive';

const VX_USB_LABEL_REGEXP = /^VxUSB-[A-Z0-9]{5}$/i;

const debug = makeDebug('usb-drive:multi');

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');
const MOUNT_TIMEOUT_MS = 5_000;
const MOUNT_RETRY_INTERVAL_MS = 100;

async function mountPartition(devicePath: string): Promise<void> {
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'mount.sh'), devicePath]);
}

async function unmountPartition(mountPoint: string): Promise<void> {
  await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'unmount.sh'), mountPoint]);
}

export type UsbDriveFilesystemType = 'fat32' | 'ext4';

async function formatDriveAsFat32(
  devicePath: string,
  label: string
): Promise<void> {
  await exec('sudo', [
    '-n',
    join(MOUNT_SCRIPT_PATH, 'format_fat32.sh'),
    devicePath,
    label,
  ]);
}

async function formatDriveAsExt4(
  devicePath: string,
  label: string
): Promise<void> {
  await exec('sudo', [
    '-n',
    join(MOUNT_SCRIPT_PATH, 'format_ext4.sh'),
    devicePath,
    label,
  ]);
}

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

function isFat32Partition(partition: UsbPartitionDeviceInfo): boolean {
  return partition.fstype === 'vfat' && partition.fsver === 'FAT32';
}

function isExt4Partition(partition: UsbPartitionDeviceInfo): boolean {
  return partition.fstype === 'ext4';
}

function isSupportedPartition(partition: UsbPartitionDeviceInfo): boolean {
  return isFat32Partition(partition) || isExt4Partition(partition);
}

export type UsbPartitionMount =
  | { type: 'unmounted' }
  | { type: 'ejected' }
  | { type: 'mounting' }
  | { type: 'mounted'; mountPoint: string }
  | { type: 'unmounting'; mountPoint: string };

export interface UsbPartitionInfo {
  devPath: string;
  label?: string;
  fstype?: string;
  fsver?: string;
  mount: UsbPartitionMount;
}

export interface UsbDriveInfo {
  devPath: string;
  vendor?: string;
  model?: string;
  serial?: string;
  partitions: UsbPartitionInfo[];
}

export interface MultiUsbDriveOptions {
  onChange?: () => void;
}

export interface MultiUsbDrive {
  getDrives(): UsbDriveInfo[];
  refresh(): Promise<void>;
  ejectDrive(driveDevPath: string): Promise<void>;
  formatDrive(
    driveDevPath: string,
    fstype: UsbDriveFilesystemType
  ): Promise<void>;
  sync(partitionDevPath: string): Promise<void>;
  stop(): void;
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
  options?: MultiUsbDriveOptions
): MultiUsbDrive {
  if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE)) {
    return createMockFileMultiUsbDrive();
  }

  const { onChange } = options ?? {};

  let stopped = false;
  let isFirstRefresh = true;
  let cachedDrives: UsbDiskDeviceInfo[] = [];

  // Per-drive eject state: cleared when the drive is no longer detected.
  const ejectedDrives = new Set<string>();

  // Per-drive action lock: 'ejecting' or 'formatting'.
  const driveAction = new KeyedTaskRunner<string, 'ejecting' | 'formatting'>();

  // Per-partition action lock: 'mounting'.
  const partitionAction = new KeyedTaskRunner<string, 'mounting'>();

  function computeMount(
    diskDevPath: string,
    partition: UsbPartitionDeviceInfo
  ): UsbPartitionMount {
    const dAction = driveAction.getTask(diskDevPath);

    if (dAction === 'ejecting') {
      // All partitions appear as unmounting (or ejected if already unmounted)
      if (partition.mountpoint) {
        return { type: 'unmounting', mountPoint: partition.mountpoint };
      }
      return { type: 'ejected' };
    }

    if (dAction === 'formatting') {
      // Report as ejected during formatting for backward compatibility — the
      // old single-drive UsbDrive reported 'ejected' while formatting, and
      // the adapter maps 'unmounted' to 'no_drive' which would confuse
      // consumers expecting 'ejected'.
      return { type: 'ejected' };
    }

    if (partitionAction.getTask(partition.devPath) === 'mounting') {
      return { type: 'mounting' };
    }

    if (ejectedDrives.has(diskDevPath)) {
      return { type: 'ejected' };
    }

    if (partition.mountpoint) {
      return { type: 'mounted', mountPoint: partition.mountpoint };
    }
    return { type: 'unmounted' };
  }

  function buildDriveInfo(disk: UsbDiskDeviceInfo): UsbDriveInfo {
    return {
      devPath: disk.devPath,
      vendor: disk.vendor,
      model: disk.model,
      serial: disk.serial,
      partitions: disk.partitions.map((p) => ({
        devPath: p.devPath,
        label: p.label,
        fstype: p.fstype,
        fsver: p.fsver,
        mount: computeMount(disk.devPath, p),
      })),
    };
  }

  function mountPartitionWithRetry(
    diskDevPath: string,
    partitionDevPath: string
  ): void {
    void partitionAction
      .perform(partitionDevPath, 'mounting', () =>
        doMountPartitionWithRetry(diskDevPath, partitionDevPath)
      )
      ?.then(() => {
        if (!stopped) onChange?.();
      });
  }

  async function doMountPartitionWithRetry(
    diskDevPath: string,
    partitionDevPath: string
  ): Promise<void> {
    try {
      await logger.logAsCurrentRole(LogEventId.UsbDriveMountInit);
      await mountPartition(partitionDevPath);
      // Poll for mount point to register
      const start = Date.now();
      while (!stopped && Date.now() - start < MOUNT_TIMEOUT_MS) {
        await doRefresh();
        const updated = cachedDrives
          .find((d) => d.devPath === diskDevPath)
          ?.partitions.find((p) => p.devPath === partitionDevPath);
        if (updated?.mountpoint) break;
        await sleep(MOUNT_RETRY_INTERVAL_MS);
      }
      const foundMountPoint = cachedDrives
        .find((d) => d.devPath === diskDevPath)
        ?.partitions.find((p) => p.devPath === partitionDevPath)?.mountpoint;
      if (foundMountPoint) {
        await logger.logAsCurrentRole(LogEventId.UsbDriveMounted, {
          disposition: 'success',
          message: `USB drive partition ${partitionDevPath} successfully auto-mounted at ${foundMountPoint}.`,
        });
      } else {
        await logger.logAsCurrentRole(LogEventId.UsbDriveMounted, {
          disposition: 'failure',
          message: `Timed out waiting for USB drive partition ${partitionDevPath} to mount.`,
          result: 'USB drive partition not mounted.',
        });
      }
    } catch (error) {
      debug(`auto-mount failed for ${partitionDevPath}: ${error}`);
      await logger.logAsCurrentRole(LogEventId.UsbDriveMounted, {
        disposition: 'failure',
        message: `Auto-mount failed for USB drive partition ${partitionDevPath}.`,
        error: (error as Error).message,
        result: 'USB drive partition not mounted.',
      });
    }
  }

  function doAutoMount(disk: UsbDiskDeviceInfo): void {
    if (stopped) return;
    if (ejectedDrives.has(disk.devPath)) return;
    if (driveAction.isBusy(disk.devPath)) return;

    for (const partition of disk.partitions) {
      if (!isSupportedPartition(partition)) continue;
      if (partition.mountpoint) continue;
      if (partitionAction.isBusy(partition.devPath)) continue;

      debug(`auto-mounting partition ${partition.devPath}`);
      mountPartitionWithRetry(disk.devPath, partition.devPath);
    }
  }

  async function doRefresh(): Promise<void> {
    if (stopped) return;
    const newDrives = await getAllUsbDrives();

    // Clear eject state for drives that have been physically removed
    for (const devPath of ejectedDrives) {
      if (!newDrives.some((d) => d.devPath === devPath)) {
        ejectedDrives.delete(devPath);
      }
    }

    const stateChanged =
      isFirstRefresh ||
      JSON.stringify(newDrives) !== JSON.stringify(cachedDrives);
    isFirstRefresh = false;
    cachedDrives = newDrives;

    for (const disk of newDrives) {
      doAutoMount(disk);
    }

    if (stateChanged) {
      onChange?.();
    }
  }

  const watcher = createBlockDeviceChangeWatcher(() => {
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

    async ejectDrive(driveDevPath: string): Promise<void> {
      const result = driveAction.perform(driveDevPath, 'ejecting', async () => {
        await logger.logAsCurrentRole(LogEventId.UsbDriveEjectInit);
        try {
          const disk = cachedDrives.find((d) => d.devPath === driveDevPath);
          assert(disk, `Drive not found: ${driveDevPath}`);

          // Wait for any in-progress partition mounts to finish. Without this,
          // a mount that completes after the unmount loop would leave the
          // partition mounted even though the eject appeared to succeed.
          await Promise.all(
            disk.partitions.map((p) => partitionAction.join(p.devPath))
          );

          // Re-read cachedDrives — mounts may have completed during the wait.
          const freshDisk = cachedDrives.find(
            (d) => d.devPath === driveDevPath
          );
          assert(freshDisk, `Drive not found: ${driveDevPath}`);

          await Promise.all(
            iter(freshDisk.partitions)
              .filterMap((p) => p.mountpoint)
              .map((mountpoint) => unmountPartition(mountpoint))
          );

          ejectedDrives.add(driveDevPath);
          await doRefresh();

          await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
            disposition: 'success',
            message: 'USB drive successfully ejected.',
          });
          debug(`Drive ${driveDevPath} ejected successfully`);
        } catch (error) {
          await logger.logAsCurrentRole(LogEventId.UsbDriveEjected, {
            disposition: 'failure',
            message: 'USB drive failed to eject.',
            error: (error as Error).message,
            result: 'USB drive not ejected.',
          });
          debug(`Drive ${driveDevPath} ejection failed: ${error}`);
          throw error;
        }
      });

      if (!result) {
        debug(`cannot eject ${driveDevPath}: action already in progress`);
        return;
      }

      await result;
    },

    async formatDrive(
      driveDevPath: string,
      fstype: UsbDriveFilesystemType
    ): Promise<void> {
      const result = driveAction.perform(
        driveDevPath,
        'formatting',
        async () => {
          await logger.logAsCurrentRole(LogEventId.UsbDriveFormatInit);
          try {
            const disk = cachedDrives.find((d) => d.devPath === driveDevPath);
            assert(disk, `Drive not found: ${driveDevPath}`);

            // Wait for any in-progress partition mounts to finish. Without this,
            // a mount that completes after the unmount loop would leave the
            // partition mounted even though the format appeared to succeed.
            await Promise.all(
              disk.partitions.map((p) => partitionAction.join(p.devPath))
            );

            // Re-read cachedDrives — mounts may have completed during the wait.
            const freshDisk = cachedDrives.find(
              (d) => d.devPath === driveDevPath
            );
            assert(freshDisk, `Drive not found: ${driveDevPath}`);

            // Unmount all mounted partitions first
            await Promise.all(
              iter(freshDisk.partitions)
                .filterMap((p) => p.mountpoint)
                .map((mountpoint) => unmountPartition(mountpoint))
            );

            // Determine label — reuse existing label if it matches VxUSB pattern
            const label = generateVxUsbLabel(freshDisk.partitions[0]?.label);

            debug(
              `formatting drive ${driveDevPath} as ${fstype} with label ${label}`
            );
            switch (fstype) {
              case 'fat32':
                await formatDriveAsFat32(driveDevPath, label);
                break;
              case 'ext4':
                await formatDriveAsExt4(driveDevPath, label);
                break;
              /* istanbul ignore next - @preserve */
              default:
                throwIllegalValue(fstype);
            }
            ejectedDrives.add(driveDevPath); // prevent auto-remount
            await doRefresh();

            await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
              disposition: 'success',
              message: `USB drive successfully formatted with a single ${
                fstype === 'ext4' ? 'ext4' : 'FAT32'
              } volume named "${label}".`,
            });
            debug(`Drive ${driveDevPath} formatted successfully`);
          } catch (error) {
            await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
              disposition: 'failure',
              message: 'Failed to format USB drive.',
              error: (error as Error).message,
              result: 'USB drive not formatted, error shown to user.',
            });
            debug(`Drive ${driveDevPath} format failed: ${error}`);
            throw error;
          }
        }
      );

      if (!result) {
        debug(`cannot format ${driveDevPath}: action already in progress`);
        return;
      }

      await result;
    },

    async sync(partitionDevPath: string): Promise<void> {
      const partition = cachedDrives
        .flatMap((d) => d.partitions)
        .find((p) => p.devPath === partitionDevPath);

      if (!partition?.mountpoint) {
        debug(`partition ${partitionDevPath} is not mounted, skipping sync`);
        return;
      }

      await exec('sync', ['-f', partition.mountpoint]);
    },

    stop(): void {
      stopped = true;
      watcher.stop();
    },
  };
}

import { join } from 'node:path';
import makeDebug from 'debug';
import { assert, assertDefined, sleep } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { exec } from './exec';
import {
  getAllUsbDrives,
  UsbDiskDeviceInfo,
  UsbPartitionDeviceInfo,
  createBlockDeviceChangeWatcher,
} from './block_devices';

export const VX_USB_LABEL_REGEXP = /VxUSB-[A-Z0-9]{5}/i;

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
  formatDrive(driveDevPath: string): Promise<void>;
  sync(partitionDevPath: string): Promise<void>;
  stop(): void;
}

export function detectMultiUsbDrive(
  logger: Logger,
  options?: MultiUsbDriveOptions
): MultiUsbDrive {
  const { onChange } = options ?? {};

  let stopped = false;
  let cachedDrives: UsbDiskDeviceInfo[] = [];

  // Per-drive eject state: cleared when the drive is no longer detected.
  const ejectState = new Set<string>();

  // Per-drive action lock: 'ejecting' or 'formatting'.
  const driveAction = new Map<string, 'ejecting' | 'formatting'>();

  // Per-partition action lock: 'mounting'.
  const partitionAction = new Map<string, 'mounting'>();

  function computeMount(
    diskDevPath: string,
    partition: UsbPartitionDeviceInfo
  ): UsbPartitionMount {
    const dAction = driveAction.get(diskDevPath);

    if (dAction === 'ejecting') {
      // All partitions appear as unmounting (or ejected if already unmounted)
      if (partition.mountpoint) {
        return { type: 'unmounting', mountPoint: partition.mountpoint };
      }
      return { type: 'ejected' };
    }

    if (dAction === 'formatting') {
      // All partitions appear as unmounted during formatting
      return { type: 'unmounted' };
    }

    if (partitionAction.get(partition.devPath) === 'mounting') {
      return { type: 'mounting' };
    }

    if (ejectState.has(diskDevPath)) {
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

  async function mountPartitionWithRetry(
    diskDevPath: string,
    partitionDevPath: string
  ): Promise<void> {
    try {
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
    } catch (error) {
      debug(`auto-mount failed for ${partitionDevPath}: ${error}`);
    } finally {
      partitionAction.delete(partitionDevPath);
      if (!stopped) {
        onChange?.();
      }
    }
  }

  function doAutoMount(disk: UsbDiskDeviceInfo): void {
    if (stopped) return;
    if (ejectState.has(disk.devPath)) return;
    if (driveAction.get(disk.devPath)) return;

    for (const partition of disk.partitions) {
      if (!isFat32Partition(partition)) continue;
      if (partition.mountpoint) continue;
      if (partitionAction.get(partition.devPath)) continue;

      debug(`auto-mounting partition ${partition.devPath}`);
      partitionAction.set(partition.devPath, 'mounting');
      void mountPartitionWithRetry(disk.devPath, partition.devPath);
    }
  }

  async function doRefresh(): Promise<void> {
    if (stopped) return;
    const newDrives = await getAllUsbDrives();

    // Clear eject state for drives that have been physically removed
    for (const devPath of ejectState) {
      if (!newDrives.some((d) => d.devPath === devPath)) {
        ejectState.delete(devPath);
      }
    }

    cachedDrives = newDrives;

    for (const disk of newDrives) {
      doAutoMount(disk);
    }

    onChange?.();
  }

  const watcher = createBlockDeviceChangeWatcher(() => void doRefresh());
  void doRefresh();

  return {
    getDrives(): UsbDriveInfo[] {
      return cachedDrives.map(buildDriveInfo);
    },

    async refresh(): Promise<void> {
      await doRefresh();
    },

    async ejectDrive(driveDevPath: string): Promise<void> {
      if (driveAction.get(driveDevPath)) {
        debug(`cannot eject ${driveDevPath}: action already in progress`);
        return;
      }

      driveAction.set(driveDevPath, 'ejecting');
      await logger.logAsCurrentRole(LogEventId.UsbDriveEjectInit);
      try {
        const disk = cachedDrives.find((d) => d.devPath === driveDevPath);
        assert(disk, `Drive not found: ${driveDevPath}`);

        // Wait for any in-progress partition mounts to finish. Without this,
        // a mount that completes after the unmount loop would leave the
        // partition mounted even though the eject appeared to succeed.
        while (disk.partitions.some((p) => partitionAction.has(p.devPath))) {
          await sleep(MOUNT_RETRY_INTERVAL_MS);
        }

        // Re-read cachedDrives — mounts may have completed during the wait.
        const freshDisk = cachedDrives.find((d) => d.devPath === driveDevPath);
        assert(freshDisk, `Drive not found: ${driveDevPath}`);

        for (const partition of freshDisk.partitions) {
          if (partition.mountpoint) {
            debug(`unmounting partition ${partition.devPath}`);
            await unmountPartition(partition.mountpoint);
          }
        }

        ejectState.add(driveDevPath);
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
      } finally {
        driveAction.delete(driveDevPath);
      }
    },

    async formatDrive(driveDevPath: string): Promise<void> {
      if (driveAction.get(driveDevPath)) {
        debug(`cannot format ${driveDevPath}: action already in progress`);
        return;
      }

      driveAction.set(driveDevPath, 'formatting');
      await logger.logAsCurrentRole(LogEventId.UsbDriveFormatInit);
      try {
        const disk = cachedDrives.find((d) => d.devPath === driveDevPath);
        assert(disk, `Drive not found: ${driveDevPath}`);

        // Wait for any in-progress partition mounts to finish. Without this,
        // a mount that completes after the unmount loop would leave the
        // partition mounted even though the format appeared to succeed.
        while (disk.partitions.some((p) => partitionAction.has(p.devPath))) {
          await sleep(MOUNT_RETRY_INTERVAL_MS);
        }

        // Re-read cachedDrives — mounts may have completed during the wait.
        const freshDisk = cachedDrives.find((d) => d.devPath === driveDevPath);
        assert(freshDisk, `Drive not found: ${driveDevPath}`);

        // Unmount all mounted partitions first
        for (const partition of freshDisk.partitions) {
          if (partition.mountpoint) {
            debug(`unmounting partition ${partition.devPath} before format`);
            await unmountPartition(partition.mountpoint);
          }
        }

        // Determine label — reuse existing label if it matches VxUSB pattern
        const label = generateVxUsbLabel(freshDisk.partitions[0]?.label);

        debug(`formatting drive ${driveDevPath} with label ${label}`);
        await formatDriveAsFat32(driveDevPath, label);
        ejectState.add(driveDevPath); // prevent auto-remount
        await doRefresh();

        await logger.logAsCurrentRole(LogEventId.UsbDriveFormatted, {
          disposition: 'success',
          message: `USB drive successfully formatted with a single FAT32 volume named "${label}".`,
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
      } finally {
        driveAction.delete(driveDevPath);
      }
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

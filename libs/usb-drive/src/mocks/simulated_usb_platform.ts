/* eslint-disable max-classes-per-file */
/* eslint-disable no-param-reassign */
import {
  assert,
  isNonExistentFileOrDirectoryError,
  iter,
} from '@votingworks/basics';
import makeDebug from 'debug';
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod/v4';
import {
  UsbDiskDevPath,
  UsbDriveFilesystemType,
  UsbPartitionDevPath,
  UsbPartitionDevPathSchema,
  UsbPartitionMountpoint,
  UsbPartitionMountpointSchema,
} from '../types';
import {
  DriveWatcher,
  UsbPlatform,
  UsbPlatformDrive,
  UsbPlatformDriveSchema,
  UsbPlatformPartition,
} from '../usb_platform_types';
import { MockFileTree, writeMockFileTree } from './helpers';

const debug = makeDebug('SimulatedUsbPlatform');

export const SimulatedUsbDriveSchema = UsbPlatformDriveSchema.extend({
  present: z.boolean(),
});

/**
 * A USB drive tracked by the simulator. Its backing storage exists for as long
 * as the drive has been created and not deleted, independent of whether it is
 * currently attached. The `present` flag models whether the drive is "plugged
 * in": only present drives are visible through the {@link UsbPlatform}
 * interface (`getAllUsbDrives`), mirroring real hardware which is only visible
 * when attached.
 */
export type SimulatedUsbDrive = z.output<typeof SimulatedUsbDriveSchema>;

interface CreateDriveOptions {
  diskPath: UsbDiskDevPath;
  /**
   * Filesystem type for the drive's single partition. Omit to create an
   * unformatted drive with no usable partition, mirroring how
   * {@link RealUsbPlatform} reports unformatted or unsupported drives.
   */
  fstype?: UsbDriveFilesystemType;
  label?: string;
  contents?: MockFileTree;
}

function findDrive(
  drives: SimulatedUsbDrive[],
  diskPath: UsbDiskDevPath
): SimulatedUsbDrive {
  const drive = drives.find((d) => d.diskPath === diskPath);
  assert(drive, `Drive not found: ${diskPath}`);
  return drive;
}

function findPresentDrive(
  drives: SimulatedUsbDrive[],
  diskPath: UsbDiskDevPath
): SimulatedUsbDrive {
  const drive = findDrive(drives, diskPath);
  assert(drive.present, `Drive not attached: ${diskPath}`);
  return drive;
}

/**
 * Finds the partition matching `predicate` on a currently-attached drive. A
 * partition can only be mounted or unmounted while its drive is present, just
 * as real hardware is only accessible while plugged in. `identifier` is used
 * only for the not-found error message.
 */
function findPresentPartition(
  drives: SimulatedUsbDrive[],
  predicate: (partition: UsbPlatformPartition) => boolean,
  identifier: string
): { drive: SimulatedUsbDrive; partition: UsbPlatformPartition } {
  const drive = drives.find(
    (d) => d.present && d.partition && predicate(d.partition)
  );
  assert(drive, `Partition not found on an attached drive: ${identifier}`);
  assert(drive.partition);
  return { drive, partition: drive.partition };
}

/**
 * Actions that can artificially fail with injected faults.
 */
export type FaultType =
  | 'mountPartition'
  | 'unmountPartition'
  | 'formatDrive'
  | 'sync';

class SimulatedUsbPlatformFaults {
  private readonly faults = new Map<
    FaultType,
    {
      repeated: boolean;
      reason: Error;
    }
  >();

  /**
   * Fails the next call of `faultType` with `reason`, then clears. Replaces
   * any previous fault of `faultType`.
   */
  failNext(faultType: FaultType, reason: Error): void {
    this.faults.set(faultType, { repeated: false, reason });
  }

  /**
   * Fails every call of `faultType` with `reason`. Replaces any previous fault
   * of `faultType`.
   */
  failRepeatedly(faultType: FaultType, reason: Error): void {
    this.faults.set(faultType, { repeated: true, reason });
  }

  /**
   * Clears any fault of `faultType` that are currently in effect.
   */
  clear(faultType: FaultType): void {
    this.faults.delete(faultType);
  }

  /**
   * Returns the next fault of `faultType` to be raised, if any, and clears it
   * if it is not repeated.
   */
  take(faultType: FaultType): Error | undefined {
    const fault = this.faults.get(faultType);
    if (fault) {
      if (!fault.repeated) this.faults.delete(faultType);
      return fault.reason;
    }
    return undefined;
  }
}

export class SimulatedUsbPlatform implements UsbPlatform {
  private watchController?: AbortController;
  private readonly internalFaults = new SimulatedUsbPlatformFaults();

  /**
   * The working set of drives during an in-progress {@link mutateState}
   * transaction. When set, it is the single source of truth that all reads and
   * mutations operate on and that gets persisted; when unset, state is read
   * fresh from {@link stateFilePath} each time.
   */
  private cachedDrives?: SimulatedUsbDrive[];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly root: string) {
    mkdirSync(this.root, { recursive: true });
    // Ensure the state file exists (so it can be read and watched) without
    // clobbering one another process may have already populated. Write the
    // initial value to a temp file and atomically hard-link it into place, so a
    // concurrent reader never observes a partially-written or empty file and an
    // existing file is left intact.
    const initPath = `${this.stateFilePath}.${process.pid}.init`;
    writeFileSync(initPath, JSON.stringify([]));
    try {
      linkSync(initPath, this.stateFilePath);
      debug('Created new devices file');
    } catch (e) {
      // @coverage-exclude: unexpected errors should propagate
      if ((e as { code?: string }).code !== 'EEXIST') {
        throw e;
      }
      debug('Using existing devices file');
    } finally {
      rmSync(initPath, { force: true });
    }
  }

  get faults(): SimulatedUsbPlatformFaults {
    return this.internalFaults;
  }

  async getDrives(): Promise<UsbPlatformDrive[]> {
    await Promise.resolve();
    // Rebuild each partition field-by-field rather than returning the stored
    // object directly: a round-trip through the JSON state file drops an
    // `undefined` mountpoint key, and this keeps the shape identical to
    // RealUsbPlatform.getDrives (which always includes an explicit mountpoint).
    return this.getSimulatedDrives()
      .filter((drive) => drive.present)
      .map(
        ({ partition, diskPath }): UsbPlatformDrive => ({
          diskPath,
          partition: partition && {
            partPath: partition.partPath,
            fstype: partition.fstype,
            label: partition.label,
            mountpoint: partition.mountpoint,
          },
        })
      );
  }

  /**
   * Returns every drive the simulator is tracking, including ones that have
   * been created but are not currently attached (`present: false`). Use this
   * to inspect or toggle a drive's presence; use {@link getDrives} for
   * the platform's view of attached hardware.
   */
  getSimulatedDrives(): SimulatedUsbDrive[] {
    try {
      if (this.cachedDrives) return this.cachedDrives;
      return z
        .array(SimulatedUsbDriveSchema)
        .parse(JSON.parse(readFileSync(this.stateFilePath, 'utf-8')));
    } catch (e) {
      if (isNonExistentFileOrDirectoryError(e)) return [];
      throw e;
    }
  }

  /**
   * Registers a listener to call when the platform's USB device state changes.
   * @param onChange The listener function to call when the state changes.
   * @returns A watcher object that can be used to stop listening.
   */
  watchChanges(onChange: () => void): DriveWatcher {
    this.listeners.add(onChange);

    if (!this.watchController) {
      this.watchController = new AbortController();
      // Watch the containing directory rather than the state file itself:
      // writes replace the file via an atomic rename (see writeStateFile),
      // which swaps the underlying inode and would leave a file-level watch
      // stale. Every event in this dedicated directory concerns our state, so
      // there is no need to filter by filename.
      watch(
        this.root,
        { signal: this.watchController.signal },
        (event, file) => {
          debug('Watch event: %s %s', event, file);
          for (const fn of this.listeners) {
            fn();
          }
        }
      );
    }

    return {
      stop: () => {
        this.listeners.delete(onChange);
        if (this.listeners.size === 0) {
          this.watchController?.abort();
          this.watchController = undefined;
        }
      },
    };
  }

  /**
   * Creates a drive's backing storage (partition, filesystem, and contents)
   * without attaching it. The drive starts out not present; call
   * {@link insertDrive} to make it visible to the platform.
   */
  createDrive(options: CreateDriveOptions): void {
    debug('Create drive: %s', options.diskPath);
    assert(
      !this.getSimulatedDrives().some((d) => d.diskPath === options.diskPath),
      `USB drive already exists: ${options.diskPath}`
    );
    assert(
      !options.contents || options.fstype !== undefined,
      'Cannot create an unformatted drive with contents'
    );

    const newDrive: SimulatedUsbDrive = {
      diskPath: options.diskPath,
      present: false,
      partition: options.fstype
        ? {
            partPath: this.partPathFromDiskPath(options.diskPath),
            fstype: options.fstype,
            label: options.label,
          }
        : undefined,
    };

    try {
      this.mutateState((drives) => {
        drives.push(newDrive);
        const storagePath = this.reinitStorage(newDrive.diskPath);
        if (options.contents) {
          writeMockFileTree(storagePath, options.contents);
        }
      });
    } catch (e) {
      rmSync(this.storagePath(newDrive.diskPath), {
        recursive: true,
        force: true,
      });
      throw e;
    }
  }

  /**
   * Attaches a previously {@link createDrive}d drive, making it present.
   */
  insertDrive(diskPath: UsbDiskDevPath): void {
    debug('Insert drive: %s', diskPath);
    this.mutateState((drives) => {
      findDrive(drives, diskPath).present = true;
    });
  }

  /**
   * Detaches a drive and marks it not present. The drive's storage is preserved
   * and can be reattached with {@link insertDrive}. Use {@link deleteDrive} to
   * destroy its storage.
   */
  removeDrive(diskPath: UsbDiskDevPath): void {
    debug('Remove drive: %s', diskPath);
    this.mutateState((drives) => {
      const drive = findPresentDrive(drives, diskPath);
      if (drive.partition) {
        this.unmountPartitionInternal(drive.partition);
      }
      drive.present = false;
    });
  }

  /**
   * Clears a drive's data without changing its presence or format.
   */
  clearDriveStorage(diskPath: UsbDiskDevPath): void {
    this.replaceDriveData(diskPath, {});
  }

  /**
   * Replaces the data in a drive with the given contents. Does not change the
   * state of the drive (presence or format).
   */
  replaceDriveData(diskPath: UsbDiskDevPath, contents: MockFileTree): void {
    debug('Replace drive data: %s', diskPath);
    findDrive(this.getSimulatedDrives(), diskPath); // asserts the drive exists
    const storagePath = this.reinitStorage(diskPath);
    writeMockFileTree(storagePath, contents);
  }

  /**
   * Detaches a drive and destroys its backing storage entirely.
   */
  deleteDrive(diskPath: UsbDiskDevPath): void {
    debug('Delete drive: %s', diskPath);
    this.mutateState((drives) => {
      const [toDelete, toKeep] = iter(drives).partition(
        (d) => d.diskPath === diskPath
      );
      assert(toDelete.length === 1, `USB drive not found: ${diskPath}`);
      this.destroyDrives(toDelete);
      return toKeep;
    });
  }

  /** Deletes every tracked drive and destroys all backing storage. */
  deleteAllDrives(): void {
    debug('Delete all drives');
    if (this.getSimulatedDrives().length === 0) return;
    this.mutateState((drives) => {
      this.destroyDrives(drives);
      return [];
    });
  }

  /**
   * Unmounts (if present) and destroys the backing storage of each given drive.
   * Caller is responsible for removing them from the persisted working set.
   */
  private destroyDrives(drives: SimulatedUsbDrive[]): void {
    for (const drive of drives) {
      if (drive.present && drive.partition) {
        this.unmountPartitionInternal(drive.partition);
      }
      debug('Deleting drive storage: %s', drive.diskPath);
      this.reinitStorage(drive.diskPath);
    }
  }

  /**
   * Mounts a partition by device path.
   * @throws {Error} If the partition is not present.
   */
  async mountPartition(partPath: UsbPartitionDevPath): Promise<void> {
    await Promise.resolve();
    this.mutateStateWithPotentialFault('mountPartition', (drives) => {
      const { drive, partition } = findPresentPartition(
        drives,
        (p) => p.partPath === partPath,
        partPath
      );
      partition.mountpoint = this.storagePath(drive.diskPath);
      mkdirSync(partition.mountpoint, { recursive: true });
    });
  }

  /**
   * Unmounts a drive by its mountpoint.
   * @throws {Error} If the drive is not present.
   */
  async unmountPartition(mountpoint: UsbPartitionMountpoint): Promise<void> {
    await Promise.resolve();
    this.mutateStateWithPotentialFault('unmountPartition', (drives) => {
      const { partition } = findPresentPartition(
        drives,
        (p) => p.mountpoint === mountpoint,
        mountpoint
      );
      this.unmountPartitionInternal(partition);
    });
  }

  /**
   * Clears a partition's mountpoint. Mutates the given partition in place, so
   * it must be called within a {@link mutateState} transaction on a partition
   * belonging to the working set.
   */
  private unmountPartitionInternal(partition: UsbPlatformPartition): void {
    assert(this.cachedDrives, 'must be called within mutateState');
    if (!partition.mountpoint) {
      debug('Partition already unmounted: %s', partition.partPath);
      return;
    }
    debug('Unmounting partition: %s', partition.partPath);
    partition.mountpoint = undefined;
  }

  /**
   * Formats a drive with the given options. This will delete any existing
   * partitions and create a new one.
   * @throws {Error} If the drive is not present.
   */
  async formatDrive(
    diskPath: UsbDiskDevPath,
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void> {
    await Promise.resolve();
    debug('Format drive: %s', diskPath);
    this.mutateStateWithPotentialFault('formatDrive', (drives) => {
      const drive = findPresentDrive(drives, diskPath);
      if (drive.partition) {
        this.unmountPartitionInternal(drive.partition);
      }

      drive.partition = {
        partPath: this.partPathFromDiskPath(drive.diskPath),
        fstype,
        label,
        mountpoint: this.storagePath(drive.diskPath),
      };

      this.replaceDriveData(drive.diskPath, {});
    });
  }

  /**
   * Synchronizes the contents of a drive with its storage. This operation is a
   * no-op for a simulated drive.
   * @throws {Error} If the drive is not present or not mounted.
   */
  async sync(mountpoint: UsbPartitionMountpoint): Promise<void> {
    await Promise.resolve();
    debug('Sync: %s', mountpoint);

    const fault = this.internalFaults.take('sync');
    if (fault) throw fault;
    const drives = await this.getDrives();
    assert(
      drives.some((d) => d.partition?.mountpoint === mountpoint),
      `Drive not mounted: ${mountpoint}`
    );
  }

  /**
   * The path to the file used to store drive state.
   */
  private get stateFilePath(): string {
    return join(this.root, 'drives.json');
  }

  /**
   * The root directory for partition storage. Partitions each have their own
   * subdirectory named after their devPath.
   */
  private get storageRoot(): string {
    return join(this.root, 'storage');
  }

  private reinitStorage(diskPath: UsbDiskDevPath): string {
    const storagePath = this.storagePath(diskPath);
    rmSync(storagePath, { recursive: true, force: true });
    mkdirSync(storagePath, { recursive: true });
    return storagePath;
  }

  /**
   * Returns the path to the storage directory for the given drive, which
   * will be in a directory named after the drive's devPath. It is not
   * guaranteed to exist on disk since it does not check that the drive
   * actually exists.
   */
  storagePath(diskPath: UsbDiskDevPath): UsbPartitionMountpoint {
    return UsbPartitionMountpointSchema.decode(
      join(this.storageRoot, basename(diskPath))
    );
  }

  private partPathFromDiskPath(diskPath: UsbDiskDevPath): UsbPartitionDevPath {
    return UsbPartitionDevPathSchema.decode(`${diskPath}1`);
  }

  private mutateStateWithPotentialFault(
    fault: FaultType,
    mutate: (drives: SimulatedUsbDrive[]) => SimulatedUsbDrive[] | void
  ): void {
    const parsedFault = this.internalFaults.take(fault);
    if (parsedFault) throw parsedFault;
    this.mutateState(mutate);
  }

  /**
   * Runs a state mutation as a read-modify-write transaction. `mutate` receives
   * the working set of drives — the only thing it may mutate — and may either
   * mutate it in place or return a replacement array. Whatever the working set
   * is at the end is persisted. Not re-entrant.
   */
  private mutateState(
    mutate: (drives: SimulatedUsbDrive[]) => SimulatedUsbDrive[] | void
  ): void {
    assert(!this.cachedDrives, 'mutateState is not re-entrant');
    this.cachedDrives = this.getSimulatedDrives();
    try {
      this.cachedDrives = mutate(this.cachedDrives) ?? this.cachedDrives;
      this.writeStateFile(this.cachedDrives);
    } finally {
      this.cachedDrives = undefined;
    }
  }

  private writeStateFile(devices: readonly SimulatedUsbDrive[]): void {
    debug('Write state file: %d device(s)', devices.length);
    for (const device of devices) {
      debug(
        'Write state file:   %s (%s, %s)',
        device.diskPath,
        device.present ? 'present' : 'absent',
        device.partition?.mountpoint ?? 'unmounted'
      );
    }
    // Write to a temp file and atomically rename it into place so a concurrent
    // reader in the shared-directory setup always sees a complete state file,
    // never a truncated or empty one mid-write.
    const tempPath = `${this.stateFilePath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(devices, null, 2));
    renameSync(tempPath, this.stateFilePath);
  }
}

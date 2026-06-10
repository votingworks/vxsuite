import {
  deferred,
  isNonExistentFileOrDirectoryError,
  iter,
  Optional,
} from '@votingworks/basics';
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  watch,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod/v4';
import {
  BlockDeviceChangeWatcher,
  UsbDiskDeviceInfo,
  UsbDiskDeviceInfoSchema,
  UsbPartitionDeviceInfo,
} from '../block_devices';
import { UsbDriveFilesystemType } from '../multi_usb_drive';
import { UsbPlatform } from '../usb_platform';
import { MockFileTree, writeMockFileTree } from './helpers';
import { SimulatedUsbPlatform } from './simulated_usb_platform';
import { UsbController } from './usb_controller';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert';

export class FilesystemUsbController implements UsbController {
  private cachedPlatform?: UsbPlatform;
  private watchController?: AbortController;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly root: string) {
    try {
      const fd = openSync(
        this.devicesFilePath,
        // eslint-disable-next-line no-bitwise
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
      );
      writeFileSync(fd, JSON.stringify([]));
      closeSync(fd);
    } catch {
      // ignore since the file already exists
    }
  }

  get platform(): UsbPlatform {
    this.cachedPlatform ??= new SimulatedUsbPlatform(this);
    return this.cachedPlatform;
  }

  getAllUsbDrives(): UsbDiskDeviceInfo[] {
    try {
      return z
        .array(UsbDiskDeviceInfoSchema)
        .parse(JSON.parse(readFileSync(this.devicesFilePath, 'utf-8')));
    } catch (e) {
      if (isNonExistentFileOrDirectoryError(e)) return [];
      throw e;
    }
  }

  addListener(listener: () => void): void {
    this.listeners.add(listener);

    if (!this.watchController) {
      this.watchController = new AbortController();
      watch(
        this.devicesFilePath,
        { signal: this.watchController.signal, recursive: true },
        () => {
          for (const fn of this.listeners) {
            fn();
          }
        }
      );
    }
  }

  removeListener(listener: () => void): void {
    this.listeners.delete(listener);

    if (this.listeners.size === 0) {
      this.watchController?.abort();
      this.watchController = undefined;
    }
  }

  insertDrive(
    contents: MockFileTree,
    options: { devPath: string; fstype: UsbDriveFilesystemType; label?: string }
  ): void {
    const { devPath } = options;

    const storagePath = this.storagePath(devPath);
    mkdirSync(storagePath, { recursive: true });

    this.updateStateFile((existingDevices, write) => {
      const newDevice: UsbDiskDeviceInfo = {
        devPath,
        partitions: [
          {
            devPath: `${devPath}1`,
            fstype: options.fstype === 'fat32' ? 'vfat' : 'ext4',
            fsver: options.fstype === 'fat32' ? 'FAT32' : '1.0',
          },
        ],
      };

      try {
        writeMockFileTree(storagePath, contents);
        write([...existingDevices, newDevice]);
      } catch (e) {
        rmSync(storagePath, { recursive: true, force: true });
        throw e;
      }
    });
  }

  removeDrive(devPath: string): void {
    const devices = this.getAllUsbDrives();
    const [toRemove, toKeep] = iter(devices).partition(
      (d) => d.devPath === devPath
    );
    this.bulkRemoveDrives(toRemove, toKeep);
  }

  removeAllDrives(): void {
    this.bulkRemoveDrives(this.getAllUsbDrives(), []);
  }

  private bulkRemoveDrives(
    toRemove: UsbDiskDeviceInfo[],
    toKeep: readonly UsbDiskDeviceInfo[]
  ): void {
    if (toRemove.length === 0) return;
    writeFileSync(this.devicesFilePath, JSON.stringify(toKeep));

    for (const drive of toRemove) {
      rmSync(this.storagePath(drive.devPath), { recursive: true, force: true });
    }
  }

  getMainPartitionMountPoint(): string {
    const drives = this.getAllUsbDrives();
    assert(drives.length === 1, 'Expected a single USB drive');
    const drive = drives[0];
    assert(drive);
    assert(
      drive.partitions.length === 1,
      'Expected a single USB drive partition'
    );
    const partition = drive.partitions[0];
    assert(partition);
    return this.storagePath(partition.devPath);
  }

  mountPartition(devPath: string): void {
    this.updateStateFile((existingDevices, write) => {
      let device: Optional<UsbDiskDeviceInfo>;
      let partition: Optional<UsbPartitionDeviceInfo>;

      for (const d of existingDevices) {
        for (const p of d.partitions) {
          if (p.devPath === devPath) {
            device = d;
            partition = p;
            break;
          }
        }
      }

      if (!device || !partition) {
        throw new Error(`USB device partition at path not found: ${devPath}`);
      }

      partition.mountpoint = this.storagePath(devPath);
      mkdirSync(partition.mountpoint, { recursive: true });
      write(existingDevices);
    });
  }

  unmountPartition(mountPoint: string): void {
    this.updateStateFile((existingDevices, write) => {
      let device: Optional<UsbDiskDeviceInfo>;
      let partition: Optional<UsbPartitionDeviceInfo>;

      for (const d of existingDevices) {
        for (const p of d.partitions) {
          if (p.mountpoint === mountPoint) {
            device = d;
            partition = p;
            break;
          }
        }
      }

      if (!device || !partition) {
        throw new Error(
          `USB device partition with mount not found: ${mountPoint}`
        );
      }

      partition.mountpoint = undefined;
      write(existingDevices);
    });
  }

  formatDrive(
    driveDevPath: string,
    fstype: UsbDriveFilesystemType,
    label?: string
  ): void {
    throw new Error('Method not implemented.');
  }

  sync(mountPoint: string): void {
    throw new Error('Method not implemented.');
  }

  private get devicesFilePath(): string {
    return join(this.root, 'devices.json');
  }

  private get lockFilePath(): string {
    return join(this.root, 'LOCK');
  }

  private get storageRoot(): string {
    return join(this.root, 'storage');
  }

  private storagePath(devPath: string): string {
    return join(this.storageRoot, basename(devPath));
  }

  private updateStateFile(
    callback: (
      devices: UsbDiskDeviceInfo[],
      write: (newDevices: UsbDiskDeviceInfo[]) => void
    ) => void
  ): void {
    const path = this.devicesFilePath;
    const devices = this.getAllUsbDrives();

    function write(newDevices: UsbDiskDeviceInfo[]) {
      writeFileSync(path, JSON.stringify(newDevices, null, 2));
    }

    callback(devices, write);
  }
}

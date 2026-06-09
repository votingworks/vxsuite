/* eslint-disable max-classes-per-file */
import assert, { fail } from 'node:assert';
import { basename, join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { UsbPlatform } from '../usb_platform';
import {
  BlockDeviceChangeWatcher,
  UsbDiskDeviceInfo,
  UsbPartitionDeviceInfo,
} from '../block_devices';
import { MockFileTree, writeMockFileTree } from './helpers';
import { UsbDriveFilesystemType } from '../multi_usb_drive';

/**
 * A USB platform implementation that tracks USB drive and partition information
 * in memory and stores the contents of the drives in a designated.
 */
export class MemoryUsbPlatform implements UsbPlatform {
  constructor(private readonly controller: MemoryUsbController) {}

  async getAllUsbDrives(): Promise<UsbDiskDeviceInfo[]> {
    return Promise.resolve(this.controller.getAllUsbDrives());
  }

  watchChanges(onDeviceChange: () => void): BlockDeviceChangeWatcher {
    this.controller.addListener(onDeviceChange);
    return {
      stop: () => {
        this.controller.removeListener(onDeviceChange);
      },
    };
  }

  async mountPartition(devPath: string): Promise<void> {
    this.controller.mountPartition(devPath);
    return Promise.resolve();
  }

  async unmountPartition(mountPoint: string): Promise<void> {
    this.controller.unmountPartition(mountPoint);
    return Promise.resolve();
  }

  async formatDrive(
    driveDevPath: string,
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void> {
    this.controller.formatDrive(driveDevPath, fstype, label);
    return Promise.resolve();
  }

  async sync(mountPoint: string): Promise<void> {
    this.controller.sync(mountPoint);
    return Promise.resolve();
  }
}

export class MemoryUsbController {
  private cachedPlatform?: MemoryUsbPlatform;
  private readonly drives = new Map<string, UsbDiskDeviceInfo>();
  private readonly partitions = new Map<
    string,
    {
      drive: UsbDiskDeviceInfo;
      partition: UsbPartitionDeviceInfo;
      mountPoint: string;
    }
  >();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly dataRoot: string) {}

  get platform(): UsbPlatform {
    this.cachedPlatform ??= new MemoryUsbPlatform(this);
    return this.cachedPlatform;
  }

  addListener(onChange: () => void): void {
    this.listeners.add(onChange);
  }

  removeListener(onChange: () => void): void {
    this.listeners.delete(onChange);
  }

  getAllUsbDrives(): UsbDiskDeviceInfo[] {
    return structuredClone(Array.from(this.drives.values()));
  }

  getMainPartitionMountPoint(): string {
    const partitions = Array.from(this.partitions.values());
    assert(
      partitions.length === 1,
      `Expected exactly one USB drive with a single partition, but there are ${this.drives.size} drive(s) and ${this.partitions.size} partition(s)`
    );
    const partition = partitions[0];
    assert(partition);
    return partition.mountPoint;
  }

  insertDrive(
    contents: MockFileTree,
    options: { devPath: string; fstype: UsbDriveFilesystemType; label?: string }
  ): void {
    const { devPath, fstype, label } = options;
    assert(
      !this.drives.has(devPath),
      `USB drive with duplicate device path: ${devPath}. Call 'removeDrive("${devPath}")' first.`
    );

    this.partitionDrive({
      drive: { devPath, partitions: [] },
      contents,
      fstype,
      label,
    });
    this.emitChange();
  }

  removeDrive(devPath: string): void {
    const drive = this.lookupDriveByDevPath(devPath);

    this.unmountDrive(drive);

    for (const partition of drive.partitions) {
      this.deletePartition(partition);
    }

    this.drives.delete(devPath);
    this.emitChange();
  }

  removeAllDrives(): void {
    for (const devPath of this.drives.keys()) {
      this.removeDrive(devPath);
    }
  }

  mountPartition(devPath: string): void {
    const { partition, mountPoint } = this.lookupPartitionByDevicePath(devPath);
    partition.mountpoint = mountPoint;
    this.emitChange();
  }

  unmountPartition(mountPoint: string): void {
    const { partition } = this.lookupPartitionByMountPoint(mountPoint);
    partition.mountpoint = undefined;
    this.emitChange();
  }

  formatDrive(
    driveDevPath: string,
    fstype: UsbDriveFilesystemType,
    label?: string
  ): void {
    const drive = this.lookupDriveByDevPath(driveDevPath);

    this.unmountDrive(drive);

    for (const partition of drive.partitions) {
      this.deletePartition(partition);
    }

    this.partitionDrive({ drive, contents: {}, fstype, label });
    this.emitChange();
  }

  sync(mountPoint: string): void {
    this.lookupPartitionByMountPoint(mountPoint);
  }

  private deletePartition(partition: UsbPartitionDeviceInfo): void {
    const { mountPoint } = this.lookupPartitionByDevicePath(partition.devPath);
    this.partitions.delete(partition.devPath);
    rmSync(mountPoint, { recursive: true, force: true });
    mkdirSync(mountPoint, { recursive: true });
  }

  private partitionDrive({
    drive,
    contents,
    fstype,
    label,
  }: {
    drive: UsbDiskDeviceInfo;
    contents: MockFileTree;
    fstype: UsbDriveFilesystemType;
    label?: string;
  }): void {
    const partitionDevPath = `${drive.devPath}1`;
    const mountPoint = join(this.dataRoot, basename(partitionDevPath), 'mount');
    writeMockFileTree(mountPoint, contents);

    const partition: UsbPartitionDeviceInfo = {
      devPath: partitionDevPath,
      fstype: fstype === 'fat32' ? 'vfat' : 'ext4',
      fsver: fstype === 'fat32' ? 'FAT32' : '1.0',
      label,
    };

    // eslint-disable-next-line no-param-reassign
    drive.partitions = [partition];
    this.drives.set(drive.devPath, drive);
    this.partitions.set(partitionDevPath, { drive, partition, mountPoint });
  }

  private unmountDrive(drive: UsbDiskDeviceInfo): void {
    for (const partition of drive.partitions) {
      if (partition.mountpoint) {
        partition.mountpoint = undefined;
        this.emitChange();
      }
    }
  }

  private lookupDriveByDevPath(devPath: string) {
    const drive = this.drives.get(devPath);
    assert(drive, `USB drive at device path not found: ${devPath}`);
    return drive;
  }

  private lookupPartitionByDevicePath(devPath: string) {
    const entry = this.partitions.get(devPath);
    assert(entry, `USB drive partition with device path not found: ${devPath}`);
    return entry;
  }

  private lookupPartitionByMountPoint(mountPoint: string) {
    for (const entry of this.partitions.values()) {
      if (entry.mountPoint === mountPoint) {
        return entry;
      }
    }

    fail(`USB drive partition with mount point not found: ${mountPoint}`);
  }

  private emitChange(): void {
    for (const onChange of this.listeners) {
      onChange();
    }
  }
}

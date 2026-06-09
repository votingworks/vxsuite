import { join } from 'node:path';
import { throwIllegalValue } from '@votingworks/basics';
import { exec } from './exec';
import {
  BlockDeviceChangeWatcher,
  createBlockDeviceChangeWatcher,
  getAllUsbDrives,
  UsbDiskDeviceInfo,
} from './block_devices';
import { UsbDriveFilesystemType } from './multi_usb_drive';

const MOUNT_SCRIPT_PATH = join(__dirname, '../scripts');

export interface UsbPlatform {
  getAllUsbDrives(): Promise<UsbDiskDeviceInfo[]>;
  watchChanges(onDeviceChange: () => void): BlockDeviceChangeWatcher;
  mountPartition(devPath: string): Promise<void>;
  unmountPartition(mountPoint: string): Promise<void>;
  formatDrive(
    devPath: string,
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void>;
  sync(mountPoint: string): Promise<void>;
}

export class RealUsbPlatform implements UsbPlatform {
  async getAllUsbDrives(): Promise<UsbDiskDeviceInfo[]> {
    return await getAllUsbDrives();
  }

  watchChanges(onDeviceChange: () => void): BlockDeviceChangeWatcher {
    return createBlockDeviceChangeWatcher(onDeviceChange);
  }

  async mountPartition(devicePath: string): Promise<void> {
    await exec('sudo', ['-n', join(MOUNT_SCRIPT_PATH, 'mount.sh'), devicePath]);
  }

  async unmountPartition(mountPoint: string): Promise<void> {
    await exec('sudo', [
      '-n',
      join(MOUNT_SCRIPT_PATH, 'unmount.sh'),
      mountPoint,
    ]);
  }

  async formatDrive(
    devPath: string,
    fstype: UsbDriveFilesystemType,
    label: string
  ): Promise<void> {
    switch (fstype) {
      case 'fat32':
        await exec('sudo', [
          '-n',
          join(MOUNT_SCRIPT_PATH, 'format_fat32.sh'),
          devPath,
          label,
        ]);
        break;
      case 'ext4':
        await exec('sudo', [
          '-n',
          join(MOUNT_SCRIPT_PATH, 'format_ext4.sh'),
          devPath,
          label,
        ]);
        break;
      default:
        /* istanbul ignore next */
        throwIllegalValue(fstype);
    }
  }

  async sync(mountPoint: string): Promise<void> {
    await exec('sync', ['-f', mountPoint]);
  }
}

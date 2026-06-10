import { UsbDiskDeviceInfo } from '../block_devices';
import { UsbDriveFilesystemType } from '../multi_usb_drive';
import { MockFileTree } from './helpers';

export interface UsbController {
  addListener(onChange: () => void): void;
  removeListener(onChange: () => void): void;
  getAllUsbDrives(): UsbDiskDeviceInfo[];
  getMainPartitionMountPoint(): string;
  insertDrive(
    contents: MockFileTree,
    options: { devPath: string; fstype: UsbDriveFilesystemType; label?: string }
  ): void;
  removeDrive(devPath: string): void;
  removeAllDrives(): void;
  mountPartition(devPath: string): void;
  unmountPartition(mountPoint: string): void;
  formatDrive(
    driveDevPath: string,
    fstype: UsbDriveFilesystemType,
    label?: string
  ): void;
  sync(mountPoint: string): void;
}

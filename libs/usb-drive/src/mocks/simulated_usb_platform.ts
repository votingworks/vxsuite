import { UsbDiskDeviceInfo, BlockDeviceChangeWatcher } from '../block_devices';
import { UsbDriveFilesystemType } from '../multi_usb_drive';
import { UsbPlatform } from '../usb_platform';
import { UsbController } from './usb_controller';

export class SimulatedUsbPlatform implements UsbPlatform {
  constructor(private readonly controller: UsbController) {}

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

import { throwIllegalValue } from '@votingworks/basics';
import { MultiUsbDrive, UsbDriveInfo } from '../multi_usb_drive';
import { MockFileUsbDrive, readFromMockFile } from './file_usb_drive';

const MOCK_DRIVE_DEV_PATH = '/dev/sdb';
const MOCK_PARTITION_DEV_PATH = '/dev/sdb1';
const MOCK_USB_LABEL = 'VxUSB-ABCDE';

export class MockFileMultiUsbDrive implements MultiUsbDrive {
  getDrives(): UsbDriveInfo[] {
    const { status } = readFromMockFile();

    switch (status.status) {
      case 'no_drive':
        return [];
      case 'mounted':
        return [
          {
            devPath: MOCK_DRIVE_DEV_PATH,
            partitions: [
              {
                devPath: MOCK_PARTITION_DEV_PATH,
                label: MOCK_USB_LABEL,
                fstype: 'vfat',
                fsver: 'FAT32',
                mount: {
                  type: 'mounted',
                  mountPoint: status.mountPoint,
                },
              },
            ],
          },
        ];
      case 'ejected':
        return [
          {
            devPath: MOCK_DRIVE_DEV_PATH,
            partitions: [
              {
                devPath: MOCK_PARTITION_DEV_PATH,
                label: MOCK_USB_LABEL,
                fstype: 'vfat',
                fsver: 'FAT32',
                mount: { type: 'ejected' },
              },
            ],
          },
        ];
      case 'error':
        return [
          {
            devPath: MOCK_DRIVE_DEV_PATH,
            partitions: [
              {
                devPath: MOCK_PARTITION_DEV_PATH,
                label: MOCK_USB_LABEL,
                fstype: 'ext4',
                fsver: '1.0',
                mount: { type: 'unmounted' },
              },
            ],
          },
        ];
      default:
        throwIllegalValue(status);
    }
  }

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  async ejectDrive(): Promise<void> {
    await new MockFileUsbDrive().eject();
  }

  async formatDrive(): Promise<void> {
    await new MockFileUsbDrive().format();
  }

  sync(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {}
}

import type { UsbDriveFilesystemType } from '@votingworks/usb-drive';

export const USB_DRIVE_STATUS_POLLING_INTERVAL_MS = 100;

export const FILESYSTEM_LABELS: Record<UsbDriveFilesystemType, string> = {
  exfat: 'exFAT',
  fat32: 'FAT32',
  ext4: 'ext4',
};

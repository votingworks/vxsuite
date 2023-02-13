import { UsbDrive } from '@votingworks/backend';

/**
 * An interface for interacting with USB drives. We inject this into the app so
 * that we can easily mock it in tests.
 */
export interface Usb {
  getUsbDrives: () => Promise<UsbDrive[]>;
}

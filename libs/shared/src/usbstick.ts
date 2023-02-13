import { assert } from '@votingworks/basics';

export type UsbDriveAvailability = 'absent' | 'present' | 'mounted';

export async function getInfo(): Promise<
  KioskBrowser.UsbDriveInfo | undefined
> {
  assert(window.kiosk);
  return (await window.kiosk.getUsbDriveInfo())[0];
}

export async function getPath(): Promise<string | undefined> {
  assert(window.kiosk);
  const usbDriveInfo = await getInfo();
  return usbDriveInfo?.mountPoint;
}

export function getAvailability(
  usbDriveInfo?: KioskBrowser.UsbDriveInfo
): UsbDriveAvailability {
  if (!usbDriveInfo) {
    return 'absent';
  }

  if (usbDriveInfo.mountPoint) {
    return 'mounted';
  }

  return 'present';
}

export async function doMount(): Promise<void> {
  assert(window.kiosk);
  const usbDriveInfo = await getInfo();
  if (!usbDriveInfo || usbDriveInfo.mountPoint) {
    return;
  }

  await window.kiosk.mountUsbDrive(usbDriveInfo.deviceName);
}

/**
 * Eject = Sync & Unmount. This ensures that data is flushed to
 * disk before resolving.
 */
export async function doEject(): Promise<void> {
  assert(window.kiosk);
  const usbDriveInfo = await getInfo();
  if (!usbDriveInfo?.mountPoint) {
    return;
  }

  await window.kiosk.syncUsbDrive(usbDriveInfo.mountPoint);
  await window.kiosk.unmountUsbDrive();
}

/**
 * Triggers linux 'sync' command which forces any cached file data to be
 * flushed to the removable drive. Used to prevent incomplete file transfers.
 */
export async function doSync(): Promise<void> {
  assert(window.kiosk);
  const usbDriveInfo = await getInfo();
  const mountPoint = usbDriveInfo?.mountPoint;
  if (!mountPoint) {
    return;
  }

  await window.kiosk.syncUsbDrive(mountPoint);
}

/**
 * Formats the USB drive, if there is one, according to the provided options.
 * Ejects the drive first if necessary.
 */
export async function doFormat(
  options: KioskBrowser.FormatUsbOptions
): Promise<void> {
  assert(window.kiosk);
  const usbDriveInfo = await getInfo();
  if (!usbDriveInfo) {
    return;
  }

  if (usbDriveInfo.mountPoint) {
    await window.kiosk.unmountUsbDrive();
  }

  await window.kiosk.formatUsbDrive(usbDriveInfo.deviceName, options);
}

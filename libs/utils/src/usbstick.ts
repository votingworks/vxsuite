import { assert } from './assert';
import { sleep } from './sleep';

export const MIN_TIME_TO_UNMOUNT_USB = 1000;

function isAvailable() {
  return !!window.kiosk;
}

export enum UsbDriveStatus {
  notavailable = 'notavailable',
  absent = 'absent',
  present = 'present',
  mounted = 'mounted',
  recentlyEjected = 'recentlyEjected',
  ejecting = 'ejecting',
}

async function getDevice(): Promise<KioskBrowser.UsbDriveInfo | undefined> {
  return (await window.kiosk?.getUsbDriveInfo())?.[0];
}

export async function getDevicePath(): Promise<string | undefined> {
  const device = await getDevice();
  return device?.mountPoint;
}

export async function getStatus(): Promise<UsbDriveStatus> {
  if (!isAvailable()) {
    return UsbDriveStatus.notavailable;
  }

  const device = await getDevice();

  if (!device) {
    return UsbDriveStatus.absent;
  }

  if (device.mountPoint) {
    return UsbDriveStatus.mounted;
  }
  return UsbDriveStatus.present;
}

export async function doMount(): Promise<void> {
  const device = await getDevice();
  if (!device || device.mountPoint) {
    return;
  }

  assert(window.kiosk);
  await window.kiosk.mountUsbDrive(device.deviceName);
}

export async function doEject(): Promise<void> {
  const device = await getDevice();
  if (!device?.mountPoint) {
    return;
  }

  const start = new Date().getTime();
  assert(window.kiosk);
  await window.kiosk.syncUsbDrive(device.mountPoint);
  await window.kiosk.unmountUsbDrive(device.deviceName);
  const timeToUnmount = new Date().getTime() - start;

  if (timeToUnmount < MIN_TIME_TO_UNMOUNT_USB) {
    await sleep(MIN_TIME_TO_UNMOUNT_USB - timeToUnmount);
  }
}

// Triggers linux 'sync' command which forces any cached file data to be
// flushed to the removable drive. Used to prevent incomplete file transfers.
export async function doSync(): Promise<void> {
  const device = await getDevice();
  const mountPoint = device?.mountPoint;
  if (!mountPoint) {
    return;
  }
  assert(window.kiosk);
  await window.kiosk.syncUsbDrive(mountPoint);
}

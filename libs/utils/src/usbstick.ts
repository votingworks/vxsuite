import { strict as assert } from 'assert';
import { sleep } from './sleep';

export const FLUSH_IO_DELAY_MS = 10_000;

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

async function getDevice(): Promise<KioskBrowser.UsbDrive | undefined> {
  return (await window.kiosk?.getUsbDrives())?.[0];
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

export async function doUnmount(): Promise<void> {
  const device = await getDevice();
  if (!device?.mountPoint) {
    return;
  }
  assert(window.kiosk);
  await window.kiosk.unmountUsbDrive(device.deviceName);
  return await sleep(FLUSH_IO_DELAY_MS);
}

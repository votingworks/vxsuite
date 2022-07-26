import { fakeKiosk } from '@votingworks/test-utils';
import {
  UsbDriveStatus,
  getStatus,
  doMount,
  doUnmount,
  getDevicePath,
  doSync,
} from './usbstick';

const mountedDevices = [
  {
    deviceName: 'sdb',
    mountPoint: '/media/usb-drive-sdb',
  },
];

const unmountedDevices = [
  {
    deviceName: 'sdb',
  },
];

test('knows USB is available', async () => {
  expect(await getStatus()).toBe(UsbDriveStatus.notavailable);
  window.kiosk = fakeKiosk();
  expect(await getStatus()).toBe(UsbDriveStatus.absent);
});

test('sees mounted USB drive', async () => {
  const fKiosk = fakeKiosk();
  window.kiosk = fKiosk;

  fKiosk.getUsbDrives.mockResolvedValue(mountedDevices);
  expect(await getStatus()).toBe(UsbDriveStatus.mounted);

  fKiosk.getUsbDrives.mockResolvedValue(unmountedDevices);
  expect(await getStatus()).toBe(UsbDriveStatus.present);
});

jest.setTimeout(12000);
test('can mount and unmount USB drive', async () => {
  const fKiosk = fakeKiosk();
  window.kiosk = fKiosk;

  // mount should do nothing
  await doMount();
  expect(window.kiosk.mountUsbDrive).not.toBeCalled();

  fKiosk.getUsbDrives.mockResolvedValue(unmountedDevices);

  // unmount should do nothing
  await doUnmount();
  expect(window.kiosk.unmountUsbDrive).not.toBeCalled();

  await doMount();
  expect(window.kiosk.mountUsbDrive).toBeCalledWith('sdb');

  const fKiosk2 = fakeKiosk();
  window.kiosk = fKiosk2;
  fKiosk2.getUsbDrives.mockResolvedValue(mountedDevices);

  // mount should do nothing
  await doMount();
  expect(window.kiosk.mountUsbDrive).not.toBeCalled();

  await doUnmount();
  expect(window.kiosk.unmountUsbDrive).toBeCalledWith('sdb');
});

test('without a kiosk, calls do not crash', async () => {
  window.kiosk = undefined;
  expect(await getStatus()).toBe(UsbDriveStatus.notavailable);

  await doMount();
  await doUnmount();
  await doSync();
});

test('can get device path', async () => {
  const fKiosk = fakeKiosk();
  window.kiosk = fKiosk;
  expect(await getDevicePath()).toEqual(undefined);
  fKiosk.getUsbDrives.mockResolvedValue(mountedDevices);

  expect(await getDevicePath()).toEqual('/media/usb-drive-sdb');
});

test('doSync triggers a sync', async () => {
  const fKiosk = fakeKiosk();
  window.kiosk = fKiosk;

  // try sync without drive mounted
  await doSync();
  expect(window.kiosk.syncUsbDrive).not.toBeCalled();

  // try sync with drive mounted
  fKiosk.getUsbDrives.mockResolvedValue(mountedDevices);
  await doMount();
  await doSync();
  expect(window.kiosk.syncUsbDrive).toBeCalledWith('/media/usb-drive-sdb');
});

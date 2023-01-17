import { fakeKiosk } from '@votingworks/test-utils';
import {
  getInfo,
  getAvailability,
  doMount,
  doEject,
  getPath,
  doSync,
  doFormat,
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

test('getInfo', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  mockKiosk.getUsbDriveInfo.mockResolvedValue(mountedDevices);
  expect(await getInfo()).toMatchObject(mountedDevices[0]!);
});

test('getAvailability', () => {
  expect(getAvailability(undefined)).toEqual('absent');
  expect(getAvailability(unmountedDevices[0])).toEqual('present');
  expect(getAvailability(mountedDevices[0])).toEqual('mounted');
});

test('getPath', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;
  expect(await getPath()).toEqual(undefined);

  mockKiosk.getUsbDriveInfo.mockResolvedValue(mountedDevices);
  expect(await getPath()).toEqual('/media/usb-drive-sdb');
});

jest.setTimeout(12000);
test('doMount & doEject', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  // without no usb drive, mount and eject should do nothing
  await doMount();
  expect(window.kiosk.mountUsbDrive).not.toBeCalled();
  await doEject();
  expect(window.kiosk.unmountUsbDrive).not.toBeCalled();

  mockKiosk.getUsbDriveInfo.mockResolvedValue(unmountedDevices);

  // with unmounted usb drive, eject should do nothing and mount should
  await doEject();
  expect(window.kiosk.unmountUsbDrive).not.toBeCalled();

  await doMount();
  expect(window.kiosk.mountUsbDrive).toBeCalledWith('sdb');

  mockKiosk.mountUsbDrive.mockClear();
  mockKiosk.getUsbDriveInfo.mockResolvedValue(mountedDevices);

  // with mounted usb drive, mount should do nothing and eject should
  await doMount();
  expect(window.kiosk.mountUsbDrive).not.toBeCalled();

  await doEject();
  expect(window.kiosk.syncUsbDrive).toBeCalledWith('/media/usb-drive-sdb');
  expect(window.kiosk.unmountUsbDrive).toBeCalledWith();
});

test('doSync', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  // try sync without drive mounted
  await doSync();
  expect(window.kiosk.syncUsbDrive).not.toBeCalled();

  // try sync with drive mounted
  mockKiosk.getUsbDriveInfo.mockResolvedValue(mountedDevices);
  await doMount();
  await doSync();
  expect(window.kiosk.syncUsbDrive).toBeCalledWith('/media/usb-drive-sdb');
});

test('doFormat', async () => {
  const mockKiosk = fakeKiosk();
  window.kiosk = mockKiosk;

  // try format without any drive
  const formatOptions: KioskBrowser.FormatUsbOptions = {
    format: 'fat32',
    name: 'test',
  };
  await doFormat(formatOptions);
  expect(window.kiosk.formatUsbDrive).not.toBeCalled();

  // try format with unmounted drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue(unmountedDevices);
  await doFormat(formatOptions);
  expect(window.kiosk.formatUsbDrive).toHaveBeenNthCalledWith(
    1,
    'sdb',
    formatOptions
  );
  expect(window.kiosk.unmountUsbDrive).not.toBeCalled();

  // try format with mounted drive
  mockKiosk.getUsbDriveInfo.mockResolvedValue(mountedDevices);
  await doFormat(formatOptions);
  expect(window.kiosk.formatUsbDrive).toHaveBeenNthCalledWith(
    2,
    'sdb',
    formatOptions
  );
  expect(window.kiosk.unmountUsbDrive).toBeCalled();
});

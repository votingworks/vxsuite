import { mockUsbDrive } from './mock_usb_drive';

test('creates a UsbDrive', () => {
  const mock = mockUsbDrive('mounted');
  expect(mock.status).toEqual('mounted');
  expect(typeof mock.eject).toEqual('function');
  expect(typeof mock.format).toEqual('function');
});

test('uses default drive status of absent', () => {
  const mock = mockUsbDrive();
  expect(mock.status).toEqual('absent');
});

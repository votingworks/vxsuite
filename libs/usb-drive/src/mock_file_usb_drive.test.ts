import { MockFileUsbDrive } from './mock_file_usb_drive';

test('TODO: proper tests', async () => {
  const usbDrive = new MockFileUsbDrive();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  await expect(usbDrive.eject()).resolves.toBeUndefined();
  await expect(usbDrive.format()).resolves.toBeUndefined();
});

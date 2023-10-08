import { Buffer } from 'buffer';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  MOCK_USB_FILE_PATH,
  MockFileUsbDrive,
  getMockFileUsbDriveHandler,
  initializeMockFile,
} from './file_usb_drive';

beforeEach(() => {
  // clear mock file from other tests or development
  initializeMockFile();
});

test('file-based USB mock', async () => {
  const usbDrive = new MockFileUsbDrive();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  await expect(usbDrive.eject()).resolves.toBeUndefined();
  await expect(usbDrive.format()).resolves.toBeUndefined();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const handler = getMockFileUsbDriveHandler();
  expect(handler.getMountPoint()).toBeUndefined();

  // Insert USB drive
  const testFilename = 'test-file.txt';
  handler.insert({
    [testFilename]: Buffer.from('test file contents'),
  });
  expect(await usbDrive.status()).toMatchObject({
    mountPoint: /\/tmp\/mock-usb-drive--*\//,
    status: 'mounted',
  });

  // USB drive contents are accessible
  const mountPoint = handler.getMountPoint();
  expect(mountPoint).toBeDefined();
  expect(existsSync(join(mountPoint!, testFilename))).toEqual(true);

  // Eject USB drive
  await usbDrive.eject();
  expect(await usbDrive.status()).toEqual({ status: 'ejected' });
  expect(existsSync(join(mountPoint!, testFilename))).toEqual(true); // contents still exist

  // Remove USB drive
  handler.remove();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  expect(existsSync(join(mountPoint!, testFilename))).toEqual(false);

  // Cleanup
  expect(existsSync(MOCK_USB_FILE_PATH)).toEqual(true);
  handler.cleanup();
  expect(existsSync(MOCK_USB_FILE_PATH)).toEqual(false);
});

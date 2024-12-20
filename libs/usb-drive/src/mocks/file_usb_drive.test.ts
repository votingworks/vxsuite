import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_MOCK_USB_DRIVE_DIR,
  MOCK_USB_DRIVE_DATA_DIRNAME,
  MockFileUsbDrive,
  getMockFileUsbDriveHandler,
} from './file_usb_drive';

test('mock flow', async () => {
  const usbDrive = new MockFileUsbDrive();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });
  await expect(usbDrive.eject()).resolves.toBeUndefined();
  await expect(usbDrive.format()).resolves.toBeUndefined();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  const handler = getMockFileUsbDriveHandler();

  // Insert USB drive
  const testFilename = 'test-file.txt';
  handler.insert({
    [testFilename]: Buffer.from('test file contents'),
  });
  const expectedMountPoint = join(
    DEFAULT_MOCK_USB_DRIVE_DIR,
    MOCK_USB_DRIVE_DATA_DIRNAME
  );
  expect(await usbDrive.status()).toMatchObject({
    mountPoint: expectedMountPoint,
    status: 'mounted',
  });

  // USB drive contents are accessible
  expect(handler.getDataPath()).toEqual(expectedMountPoint);
  const expectedTestFilePath = join(expectedMountPoint, testFilename);
  expect(existsSync(expectedTestFilePath)).toEqual(true);

  // Eject USB drive
  await usbDrive.eject();
  expect(await usbDrive.status()).toEqual({ status: 'ejected' });

  // Remove USB drive
  handler.remove();
  expect(await usbDrive.status()).toEqual({ status: 'no_drive' });

  // USB drive contents should still exist
  expect(existsSync(expectedTestFilePath)).toEqual(true);

  // Cleanup
  handler.cleanup();
  expect(existsSync(expectedTestFilePath)).toEqual(false);
});

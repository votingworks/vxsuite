import path from 'path';
import { Buffer } from 'buffer';
import { assert } from '@votingworks/basics';
import * as fs from 'fs/promises';
import { createMockUsb } from './mock_usb';

test('mock usb can read and write a single file', async () => {
  const mockUsb = createMockUsb();
  const textBuffer = Buffer.from('example text');
  const filename = 'test.txt';
  mockUsb.insertUsbDrive({
    [filename]: textBuffer,
  });

  const drives = await mockUsb.mock.getUsbDrives();
  expect(drives).toHaveLength(1);
  const usbDrive = drives[0];
  assert(usbDrive?.mountPoint !== undefined);

  const usbPath = path.join(usbDrive.mountPoint, filename);
  const fileContents = await fs.readFile(usbPath);
  expect(fileContents).toEqual(textBuffer);
});

test('mock usb can read and write directories', async () => {
  const mockUsb = createMockUsb();
  const textBuffer = Buffer.from('example text');
  const dir = 'my-directory';
  const filename = 'test.txt';
  mockUsb.insertUsbDrive({
    [dir]: {
      [filename]: textBuffer,
    },
  });

  const drives = await mockUsb.mock.getUsbDrives();
  expect(drives).toHaveLength(1);
  const usbDrive = drives[0];
  assert(usbDrive?.mountPoint !== undefined);

  const usbPath = path.join(usbDrive.mountPoint, dir);
  const files = await fs.readdir(usbPath, { withFileTypes: true });
  expect(files).toHaveLength(1);
  const file = files[0];
  assert(file !== undefined);
  expect(file.name).toEqual(filename);
});

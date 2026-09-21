import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { createMockUsbDrive } from './memory_usb_drive.js';

test('insert/remove drive', () => {
  const mock = createMockUsbDrive();
  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
  mock.removeUsbDrive();
});

test('remove before insert is fine', () => {
  const mock = createMockUsbDrive();
  mock.removeUsbDrive();
  mock.insertUsbDrive({});
});

test('insert twice is fine', () => {
  const mock = createMockUsbDrive();
  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
});

test('insert with space', async () => {
  const mock = createMockUsbDrive();
  mock.insertUsbDrive({}, { space: { totalBytes: 10, availableBytes: 5 } });
  expect(await mock.usbDrive.status()).toMatchObject({
    status: 'mounted',
    totalBytes: 10,
    availableBytes: 5,
  });
});

test('assertComplete', async () => {
  const mock = createMockUsbDrive();
  mock.removeUsbDrive();
  mock.insertUsbDrive({});
  await mock.usbDrive.status();
  mock.assertComplete();
});

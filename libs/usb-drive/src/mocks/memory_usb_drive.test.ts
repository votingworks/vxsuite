import { test } from 'vitest';
import { Buffer } from 'node:buffer';
import { createMockUsbDrive } from './memory_usb_drive';

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

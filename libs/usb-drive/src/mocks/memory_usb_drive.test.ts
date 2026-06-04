import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockUsbDriveManager } from './memory_usb_drive';

test('insert/remove drive', () => {
  const mock = new MockUsbDriveManager();

  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
  expect(readFileSync(join(mock.getMountPoint(), 'file.txt'), 'utf-8')).toEqual(
    'contents'
  );

  mock.removeUsbDrive();
  expect(() => mock.getMountPoint()).toThrow();
});

test('remove before insert is fine', () => {
  const mock = new MockUsbDriveManager();
  mock.removeUsbDrive();
  mock.insertUsbDrive({});
});

test('insert twice is fine', () => {
  const mock = new MockUsbDriveManager();
  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
  mock.insertUsbDrive({ 'file.txt': Buffer.from('contents') });
});

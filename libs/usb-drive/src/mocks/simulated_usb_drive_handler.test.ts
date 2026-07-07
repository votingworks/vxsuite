import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockLogger } from '@votingworks/logging';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectMultiUsbDrive } from '../multi_usb_drive';
import { UsbDiskDevPathSchema, UsbPartitionMount } from '../types';
import {
  getMockUsbDirPath,
  resetMockUsbDriveDir,
  setMockUsbDriveDir,
} from './mock_usb_dir';
import { SimulatedUsbPlatform } from './simulated_usb_platform';
import { getMockUsbDriveHandler } from './simulated_usb_drive_handler';

beforeEach(() => {
  setMockUsbDriveDir(makeTemporaryDirectory());
});

afterEach(() => {
  resetMockUsbDriveDir();
});

test('drive lifecycle through the handler', () => {
  const handler = getMockUsbDriveHandler();

  // Nothing inserted yet.
  expect(handler.status()).toEqual({ status: 'no_drive' });
  handler.remove(); // no-op when absent
  handler.clearData(); // no-op when absent
  handler.cleanup(); // no-op when absent
  expect(handler.status()).toEqual({ status: 'no_drive' });

  // Insert with contents: present but not yet mounted by any app.
  handler.insert({ README: Buffer.from('hello') });
  expect(handler.status()).toEqual({ status: 'ejected' });
  const dataPath = handler.getDataPath();
  expect(readFileSync(join(dataPath, 'README'), 'utf-8')).toEqual('hello');

  // Re-inserting with new contents replaces the data in place.
  handler.insert({ README: Buffer.from('updated') });
  expect(readFileSync(join(dataPath, 'README'), 'utf-8')).toEqual('updated');

  // Clearing data keeps the drive but empties storage.
  handler.clearData();
  expect(existsSync(join(dataPath, 'README'))).toEqual(false);

  // Remove detaches the drive; re-insert without contents reattaches it.
  handler.remove();
  expect(handler.status()).toEqual({ status: 'no_drive' });
  handler.insert();
  expect(handler.status()).toEqual({ status: 'ejected' });

  // Cleanup destroys the drive entirely.
  handler.cleanup();
  expect(handler.status()).toEqual({ status: 'no_drive' });
});

test('a drive inserted via the handler is auto-mounted by a detached platform', async () => {
  // Mirrors integration testing: the handler (test process) and the app's
  // platform read/write the same mock dir, communicating through `drives.json`.
  const handler = getMockUsbDriveHandler();
  const appPlatform = new SimulatedUsbPlatform(getMockUsbDirPath());
  const logger = mockLogger({ fn: vi.fn });
  const multiUsbDrive = detectMultiUsbDrive({ logger, platform: appPlatform });
  const mountpoint = appPlatform.storagePath(
    UsbDiskDevPathSchema.decode('/dev/sdb')
  );
  expect(handler.getDataPath()).toEqual(mountpoint);

  handler.insert({ README: Buffer.from('election package') });

  await vi.waitFor(() => {
    expect(multiUsbDrive.getDrives()[0]?.partition?.mount).toEqual(
      UsbPartitionMount.mounted(mountpoint)
    );
  });

  // Once the app mounts it, the handler observes the mounted status too.
  expect(handler.status()).toEqual({
    status: 'mounted',
    mountpoint,
  });
  expect(readFileSync(join(mountpoint, 'README'), 'utf-8')).toEqual(
    'election package'
  );

  // Removing the drive propagates back to the app.
  handler.remove();
  await vi.waitFor(() => {
    expect(multiUsbDrive.getDrives()).toEqual([]);
  });

  multiUsbDrive.stop();
});

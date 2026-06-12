import { assertDefined } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, expect, test, vi } from 'vitest';
import {
  getMockFileUsbDriveHandler,
  getMockUsbDirPath,
  getMockUsbPlatform,
  getSimulatedUsbPlatform,
} from './file_usb_drive';
import { UsbDiskDevPathSchema, UsbPartitionDevPathSchema } from '../types';

const featureFlagMock = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
});

const devsdb = UsbDiskDevPathSchema.decode('/dev/sdb');
const devsdb1 = UsbPartitionDevPathSchema.decode('/dev/sdb1');

test('getSimulatedUsbPlatform returns undefined unless the flag is enabled', () => {
  expect(getSimulatedUsbPlatform()).toBeUndefined();

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_MOCK_USB_DRIVE
  );
  const platform = assertDefined(getSimulatedUsbPlatform());

  // Backed by the same state as the mock platform used by dev tooling
  platform.createDrive({ diskPath: devsdb, fstype: 'fat32' });
  expect(
    getMockUsbPlatform()
      .getSimulatedDrives()
      .map((drive) => drive.diskPath)
  ).toEqual([devsdb]);
});

test('handler lifecycle: insert, status, remove, clearData, cleanup', async () => {
  const handler = getMockFileUsbDriveHandler();

  expect(handler.status()).toEqual({ status: 'no_drive' });
  expect(handler.getDataPath()).toEqual(
    join(getMockUsbDirPath(), 'storage', 'sdb')
  );

  // Insert creates the drive on first use and seeds contents
  handler.insert({ README: Buffer.from('hello') });
  expect(handler.status()).toEqual({ status: 'ejected' });
  await expect(
    readFile(join(assertDefined(handler.getDataPath()), 'README'), 'utf-8')
  ).resolves.toEqual('hello');

  // Once a consuming app mounts the partition, status reports mounted
  const platform = getMockUsbPlatform();
  await platform.mountPartition(devsdb1);
  expect(handler.status()).toEqual({
    status: 'mounted',
    mountpoint: handler.getDataPath(),
  });

  // Inserting again merges contents without detaching
  handler.insert({ OTHER: Buffer.from('world') });
  expect(handler.status()).toMatchObject({ status: 'mounted' });
  await expect(
    readFile(join(assertDefined(handler.getDataPath()), 'OTHER'), 'utf-8')
  ).resolves.toEqual('world');

  handler.remove();
  expect(handler.status()).toEqual({ status: 'no_drive' });
  // Removal preserves data, like unplugging real hardware
  expect(
    existsSync(join(assertDefined(handler.getDataPath()), 'README'))
  ).toEqual(true);

  // Removing again is a no-op
  handler.remove();
  expect(handler.status()).toEqual({ status: 'no_drive' });

  handler.clearData();
  expect(
    existsSync(join(assertDefined(handler.getDataPath()), 'README'))
  ).toEqual(false);

  handler.cleanup();
  expect(getMockUsbPlatform().getSimulatedDrives()).toEqual([]);
});

test('handler clearData and cleanup are no-ops before the drive exists', () => {
  const handler = getMockFileUsbDriveHandler();
  handler.clearData();
  handler.cleanup();
  expect(handler.status()).toEqual({ status: 'no_drive' });
});

test('handlers for different disk names track separate drives', () => {
  const sdb = getMockFileUsbDriveHandler('sdb');
  const sdc = getMockFileUsbDriveHandler('sdc');

  sdb.insert();
  expect(sdb.status()).toEqual({ status: 'ejected' });
  expect(sdc.status()).toEqual({ status: 'no_drive' });

  sdc.insert();
  sdb.remove();
  expect(sdb.status()).toEqual({ status: 'no_drive' });
  expect(sdc.status()).toEqual({ status: 'ejected' });
});

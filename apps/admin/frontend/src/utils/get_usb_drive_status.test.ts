import { expect, test } from 'vitest';
import type { UsbDriveInfo, UsbPartitionInfo } from '@votingworks/usb-drive';
import { getUsbDriveStatus } from './get_usb_drive_status';

function makePartition(
  mount: UsbPartitionInfo['mount'],
  fstype?: string
): UsbPartitionInfo {
  return { devPath: '/dev/sdb1', mount, fstype };
}

function makeDrive(partitions: UsbPartitionInfo[]): UsbDriveInfo {
  return { devPath: '/dev/sdb', partitions };
}

test('no_drive when drives list is empty', () => {
  expect(getUsbDriveStatus([])).toEqual({ status: 'no_drive' });
});

test('no_drive when drive has no partitions', () => {
  expect(getUsbDriveStatus([makeDrive([])])).toEqual({ status: 'no_drive' });
});

test('mounted when partition is mounted with vfat', () => {
  expect(
    getUsbDriveStatus([
      makeDrive([
        makePartition(
          { type: 'mounted', mountPoint: '/media/vx/usb-drive-sdb1' },
          'vfat'
        ),
      ]),
    ])
  ).toEqual({
    status: 'mounted',
    mountPoint: '/media/vx/usb-drive-sdb1',
    devPath: '/dev/sdb',
  });
});

test('bad_format error when partition is mounted with non-vfat filesystem', () => {
  expect(
    getUsbDriveStatus([
      makeDrive([
        makePartition(
          { type: 'mounted', mountPoint: '/media/vx/usb-drive-sdb1' },
          'ntfs'
        ),
      ]),
    ])
  ).toEqual({ status: 'error', reason: 'bad_format', devPath: '/dev/sdb' });
});

test('ejected when partition is unmounted', () => {
  expect(
    getUsbDriveStatus([makeDrive([makePartition({ type: 'unmounted' })])])
  ).toEqual({ status: 'ejected' });
});

test('bad_format error when partition is unmounted with non-vfat filesystem', () => {
  expect(
    getUsbDriveStatus([
      makeDrive([makePartition({ type: 'unmounted' }, 'ntfs')]),
    ])
  ).toEqual({ status: 'error', reason: 'bad_format', devPath: '/dev/sdb' });
});

test('ejected when partition is unmounting', () => {
  expect(
    getUsbDriveStatus([
      makeDrive([
        makePartition({
          type: 'unmounting',
          mountPoint: '/media/vx/usb-drive-sdb1',
        }),
      ]),
    ])
  ).toEqual({ status: 'ejected' });
});

test('no_drive when partition is mounting', () => {
  expect(
    getUsbDriveStatus([makeDrive([makePartition({ type: 'mounting' })])])
  ).toEqual({ status: 'no_drive' });
});

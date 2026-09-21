import { expect, test } from 'vitest';
import { checkFileFitsOnUsbDrive } from './usb_drive_space.js';

const MIB = 1024 * 1024;

test('fits when the drive reports no limits', () => {
  expect(checkFileFitsOnUsbDrive({}, Number.MAX_SAFE_INTEGER)).toEqual('fits');
});

test('file-too-large takes precedence over space', () => {
  expect(
    checkFileFitsOnUsbDrive(
      { maxFileSize: 100, totalBytes: 10, availableBytes: 10 },
      101
    )
  ).toEqual('file-too-large');
});

test('drive-too-small when the whole drive cannot hold the file', () => {
  expect(
    checkFileFitsOnUsbDrive(
      { totalBytes: 10 * MIB, availableBytes: 10 * MIB },
      9.5 * MIB
    )
  ).toEqual('drive-too-small');
});

test('insufficient-space when the drive is big enough but too full', () => {
  expect(
    checkFileFitsOnUsbDrive(
      { totalBytes: 100 * MIB, availableBytes: 10 * MIB },
      9.5 * MIB
    )
  ).toEqual('insufficient-space');
});

test('fits with room for file system overhead', () => {
  expect(
    checkFileFitsOnUsbDrive(
      {
        maxFileSize: 100 * MIB,
        totalBytes: 100 * MIB,
        availableBytes: 11 * MIB,
      },
      10 * MIB
    )
  ).toEqual('fits');
});

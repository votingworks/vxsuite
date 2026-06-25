import { expect, test } from 'vitest';
import {
  DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  getMockUsbDirPath,
  resetMockUsbDriveDir,
  setMockUsbDriveDir,
} from './mock_usb_dir';

// `test/setup.ts` points the mock USB dir at a fresh temporary directory before
// each test, so reset first to observe the built-in default.

test('mock USB dir defaults to a repo-relative path matching the glob pattern', () => {
  resetMockUsbDriveDir();
  const dir = getMockUsbDirPath();
  expect(dir.endsWith('/usb-drive')).toEqual(true);
  expect(DEV_MOCK_USB_DRIVE_GLOB_PATTERN).toEqual(`${dir}/**/*`);
});

test('the mock USB dir can be overridden and reset', () => {
  setMockUsbDriveDir('/tmp/some-mock-usb-dir');
  expect(getMockUsbDirPath()).toEqual('/tmp/some-mock-usb-dir');
  resetMockUsbDriveDir();
  expect(`${getMockUsbDirPath()}/**/*`).toEqual(
    DEV_MOCK_USB_DRIVE_GLOB_PATTERN
  );
});

import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import {
  clearTemporaryRootDir,
  makeTemporaryDirectory,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { join } from 'node:path';
import {
  resetMockUsbDriveDir,
  setMockUsbDriveDir,
} from '../src/mocks/mock_usb_dir';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

beforeEach(() => {
  setMockUsbDriveDir(join(makeTemporaryDirectory(), 'usb-drive'));
});

afterEach(() => {
  resetMockUsbDriveDir();
});

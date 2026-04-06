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
} from '@votingworks/usb-drive';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

beforeEach(() => {
  setMockUsbDriveDir(join(makeTemporaryDirectory(), 'usb-drive'));
});

afterEach(() => {
  resetMockUsbDriveDir();
});

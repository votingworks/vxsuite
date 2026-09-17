import { afterEach, beforeEach } from 'vitest';
import '@votingworks/fixtures/vitest-setup';
import { makeTemporaryDirectory } from '@votingworks/fixtures/tmpdir';
import { join } from 'node:path';
import {
  resetMockUsbDriveDir,
  setMockUsbDriveDir,
} from '../src/mocks/mock_usb_dir.js';

beforeEach(() => {
  setMockUsbDriveDir(join(makeTemporaryDirectory(), 'usb-drive'));
});

afterEach(() => {
  resetMockUsbDriveDir();
});

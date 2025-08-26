import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';
import { resetAdminTestContext } from './apps/admin';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

beforeEach(() => {
  getMockFileUsbDriveHandler().clearData();
  resetAdminTestContext();
});

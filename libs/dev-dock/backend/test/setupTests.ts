import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  makeTemporaryDirectory,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { join } from 'node:path';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

/**
 * Allow mocking `@votingworks/usb-drive` in tests by not eagerly loading it
 * here and using `vi.importActual` to bypass any mocks that are registered.
 */
function importUsbDrivePackage(): Promise<
  typeof import('@votingworks/usb-drive')
> {
  return vi.importActual('@votingworks/usb-drive');
}

beforeEach(async () => {
  const { setMockUsbDriveDir } = await importUsbDrivePackage();
  setMockUsbDriveDir(join(makeTemporaryDirectory(), 'usb-drive'));
});

afterEach(async () => {
  const { resetMockUsbDriveDir } = await importUsbDrivePackage();
  resetMockUsbDriveDir();
});

import { afterEach, beforeEach, vi } from 'vitest';
import '@votingworks/fixtures/vitest-setup';
import { makeTemporaryDirectory } from '@votingworks/fixtures/tmpdir';
import { join } from 'node:path';

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

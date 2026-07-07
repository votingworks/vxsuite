import { getMockStateRootDir } from '@votingworks/utils';
import { join } from 'node:path';

// libs/usb-drive/src/mocks/ is 4 levels below the repo root
const REPO_ROOT = join(__dirname, '../../../..');
const MOCK_USB_DRIVE_DIR = join(getMockStateRootDir(REPO_ROOT), 'usb-drive');
export const DEV_MOCK_USB_DRIVE_GLOB_PATTERN = join(MOCK_USB_DRIVE_DIR, '**/*');

let mockUsbDriveDirOverride: string | undefined;

/**
 * Overrides the mock USB drive directory. Use in test setup to isolate
 * tests from each other when they run in parallel.
 */
export function setMockUsbDriveDir(dir: string): void {
  mockUsbDriveDirOverride = dir;
}

/**
 * Clears the mock USB drive directory override, reverting to the default.
 */
export function resetMockUsbDriveDir(): void {
  mockUsbDriveDirOverride = undefined;
}

/**
 * The directory backing the mock USB platform. A {@link SimulatedUsbPlatform}
 * rooted here is shared by the app (via `getEnvUsbPlatform`) and by test/dev
 * tools (via `getMockUsbDriveHandler`).
 */
export function getMockUsbDirPath(): string {
  return mockUsbDriveDirOverride ?? MOCK_USB_DRIVE_DIR;
}

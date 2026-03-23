import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const REAL_USB_DRIVE_GLOB_PATTERN = '/media/**/*';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function importScanGlobals() {
  return import('./scan_globals.js');
}

async function importDevMockUsbDriveGlobPattern() {
  const { DEV_MOCK_USB_DRIVE_GLOB_PATTERN } = await import(
    '@votingworks/usb-drive'
  );
  return DEV_MOCK_USB_DRIVE_GLOB_PATTERN;
}

test('NODE_ENV=test - allows /tmp and dev mock USB drive', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  const { SCAN_ALLOWED_EXPORT_PATTERNS } = await importScanGlobals();
  const devMockPattern = await importDevMockUsbDriveGlobPattern();
  expect(SCAN_ALLOWED_EXPORT_PATTERNS).toEqual(['/tmp/**/*', devMockPattern]);
});

test('NODE_ENV=development - allows real USB and dev mock USB drive', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  const { SCAN_ALLOWED_EXPORT_PATTERNS } = await importScanGlobals();
  const devMockPattern = await importDevMockUsbDriveGlobPattern();
  expect(SCAN_ALLOWED_EXPORT_PATTERNS).toEqual([
    REAL_USB_DRIVE_GLOB_PATTERN,
    devMockPattern,
  ]);
});

test('NODE_ENV=production (non-integration) - allows real USB drive only', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('IS_INTEGRATION_TEST', undefined);
  vi.stubEnv('REACT_APP_IS_INTEGRATION_TEST', undefined);
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  const { SCAN_ALLOWED_EXPORT_PATTERNS } = await importScanGlobals();
  expect(SCAN_ALLOWED_EXPORT_PATTERNS).toEqual([REAL_USB_DRIVE_GLOB_PATTERN]);
});

test('NODE_ENV=production (integration test) - allows real USB and dev mock USB drive', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('IS_INTEGRATION_TEST', 'true');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  const { SCAN_ALLOWED_EXPORT_PATTERNS } = await importScanGlobals();
  const devMockPattern = await importDevMockUsbDriveGlobPattern();
  expect(SCAN_ALLOWED_EXPORT_PATTERNS).toEqual([
    REAL_USB_DRIVE_GLOB_PATTERN,
    devMockPattern,
  ]);
});

test('SCAN_ALLOWED_EXPORT_PATTERNS env var overrides defaults', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', '/foo/**/*,/bar/**/*');
  const { SCAN_ALLOWED_EXPORT_PATTERNS } = await importScanGlobals();
  expect(SCAN_ALLOWED_EXPORT_PATTERNS).toEqual(['/foo/**/*', '/bar/**/*']);
});

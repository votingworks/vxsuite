import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  REAL_USB_DRIVE_GLOB_PATTERN,
} from '@votingworks/usb-drive';
import { DEV_MACHINE_ID } from '@votingworks/types';
import { getMachineId, getNodeEnv, getScanAllowedExportPatterns } from './globals.js';

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('NODE_ENV=test - allows /tmp and dev mock USB drive', () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  expect(getScanAllowedExportPatterns()).toEqual([
    '/tmp/**/*',
    DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  ]);
});

test('NODE_ENV=development - allows real USB and dev mock USB drive', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  expect(getScanAllowedExportPatterns()).toEqual([
    REAL_USB_DRIVE_GLOB_PATTERN,
    DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  ]);
});

test('NODE_ENV=production (non-integration) - allows real USB drive only', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('IS_INTEGRATION_TEST', undefined);
  vi.stubEnv('REACT_APP_IS_INTEGRATION_TEST', undefined);
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  expect(getScanAllowedExportPatterns()).toEqual([REAL_USB_DRIVE_GLOB_PATTERN]);
});

test('NODE_ENV=production (integration test) - allows real USB and dev mock USB drive', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('IS_INTEGRATION_TEST', 'true');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', undefined);
  expect(getScanAllowedExportPatterns()).toEqual([
    REAL_USB_DRIVE_GLOB_PATTERN,
    DEV_MOCK_USB_DRIVE_GLOB_PATTERN,
  ]);
});

test('SCAN_ALLOWED_EXPORT_PATTERNS env var overrides defaults', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SCAN_ALLOWED_EXPORT_PATTERNS', '/foo/**/*,/bar/**/*');
  expect(getScanAllowedExportPatterns()).toEqual(['/foo/**/*', '/bar/**/*']);
});

test('getNodeEnv defaults to development when NODE_ENV is unset', () => {
  vi.stubEnv('NODE_ENV', undefined);
  expect(getNodeEnv()).toEqual('development');
});

test('getNodeEnv rejects a value that is not a node environment', () => {
  vi.stubEnv('NODE_ENV', 'staging');
  expect(() => getNodeEnv()).toThrow(
    'NODE_ENV should be one of development, production, test'
  );
});

test('getMachineId falls back to the dev machine ID', () => {
  vi.stubEnv('VX_MACHINE_ID', undefined);
  expect(getMachineId()).toEqual(DEV_MACHINE_ID);

  vi.stubEnv('VX_MACHINE_ID', 'machine-1');
  expect(getMachineId()).toEqual('machine-1');
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import path from 'node:path';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { isNetworkingEnabled } from './config.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

const FLAG = BooleanEnvironmentVariableName.ENABLE_CENTRAL_SCAN_NETWORKING;
const TEST_CONFIG_ROOT = '/tmp/test-vx-config';
const originalConfigRoot = process.env['VX_CONFIG_ROOT'];
const originalNodeEnv = process.env['NODE_ENV'];

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
  vi.mocked(fs.readFileSync).mockReset();
  process.env['VX_CONFIG_ROOT'] = TEST_CONFIG_ROOT;
  // Default tests to the production code path (where the file gate applies).
  process.env['NODE_ENV'] = 'production';
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  if (originalConfigRoot === undefined) {
    delete process.env['VX_CONFIG_ROOT'];
  } else {
    process.env['VX_CONFIG_ROOT'] = originalConfigRoot;
  }
  process.env['NODE_ENV'] = originalNodeEnv;
});

test('returns false when the env var feature flag is disabled', () => {
  vi.mocked(fs.readFileSync).mockReturnValue('enable');
  expect(isNetworkingEnabled(FLAG)).toEqual(false);
  // File is never consulted because the env-var gate short-circuits.
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

test('skips the file check and returns true in non-production environments', () => {
  featureFlagMock.enableFeatureFlag(FLAG);
  process.env['NODE_ENV'] = 'development';
  expect(isNetworkingEnabled(FLAG)).toEqual(true);
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

test('returns false when VX_CONFIG_ROOT is unset in production', () => {
  featureFlagMock.enableFeatureFlag(FLAG);
  delete (process.env as { VX_CONFIG_ROOT?: string }).VX_CONFIG_ROOT;
  expect(isNetworkingEnabled(FLAG)).toEqual(false);
  expect(fs.readFileSync).not.toHaveBeenCalled();
});

test('returns false when the env var is enabled but the file is missing', () => {
  featureFlagMock.enableFeatureFlag(FLAG);
  vi.mocked(fs.readFileSync).mockImplementation(() => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  expect(isNetworkingEnabled(FLAG)).toEqual(false);
});

test('returns false when the file contents are not "enable"', () => {
  featureFlagMock.enableFeatureFlag(FLAG);
  vi.mocked(fs.readFileSync).mockReturnValue('disable');
  expect(isNetworkingEnabled(FLAG)).toEqual(false);

  vi.mocked(fs.readFileSync).mockReturnValue('something else');
  expect(isNetworkingEnabled(FLAG)).toEqual(false);
});

test('returns true when the env var is enabled and the file at $VX_CONFIG_ROOT/local-ethernet-state says "enable"', () => {
  featureFlagMock.enableFeatureFlag(FLAG);
  vi.mocked(fs.readFileSync).mockReturnValue('enable\n');
  expect(isNetworkingEnabled(FLAG)).toEqual(true);
  expect(fs.readFileSync).toHaveBeenCalledWith(
    path.join(TEST_CONFIG_ROOT, 'local-ethernet-state'),
    'utf-8'
  );
});

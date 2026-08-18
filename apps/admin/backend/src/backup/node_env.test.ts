import { afterEach, expect, test, vi } from 'vitest';
import {
  checkMachineConfigEnv,
  checkNodeEnv,
  checkNodeEnvIfSet,
} from './node_env.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

test('accepts an environment it recognizes', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(checkNodeEnv()).toBeUndefined();
  expect(checkNodeEnvIfSet()).toBeUndefined();
});

test('says what to do when the environment is missing', () => {
  vi.stubEnv('NODE_ENV', undefined);
  expect(checkNodeEnv()).toContain('Missing required NODE_ENV env var');
  expect(checkNodeEnv()).toContain('Set NODE_ENV=production on a VxAdmin');
});

test('says what to do when the environment is not one it knows', () => {
  vi.stubEnv('NODE_ENV', 'staging');
  expect(checkNodeEnv()).toContain(
    'NODE_ENV should be one of development, production, test'
  );
});

test('the early check passes over a missing environment', () => {
  vi.stubEnv('NODE_ENV', undefined);
  // `bin/backups` runs this before the CLI can apply its development-workspace
  // rule, so it must not reject an absent value on the CLI's behalf.
  expect(checkNodeEnvIfSet()).toBeUndefined();
});

test('the early check treats an empty value as missing, like the CLI does', () => {
  vi.stubEnv('NODE_ENV', '');
  // The CLI's development-workspace rule uses the falsy check, so `NODE_ENV=`
  // must reach that rule rather than be rejected here first.
  expect(checkNodeEnvIfSet()).toBeUndefined();
});

test('the early check still rejects a value it does not know', () => {
  vi.stubEnv('NODE_ENV', 'staging');
  expect(checkNodeEnvIfSet()).toContain('NODE_ENV should be one of');
});

test('asks a real machine for its identity', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_MACHINE_ID', 'AD-1234');
  vi.stubEnv('VX_CODE_VERSION', undefined);

  expect(checkMachineConfigEnv()).toContain(
    'Missing required VX_CODE_VERSION env var.'
  );
});

test('accepts a real machine that knows its identity', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VX_MACHINE_ID', 'AD-1234');
  vi.stubEnv('VX_CODE_VERSION', '1.2.3');

  expect(checkMachineConfigEnv()).toBeUndefined();
});

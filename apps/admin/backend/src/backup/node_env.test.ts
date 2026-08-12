import { afterEach, expect, test, vi } from 'vitest';
import { checkNodeEnv, checkNodeEnvIfSet } from './node_env.js';

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

test('the early check still rejects a value it does not know', () => {
  vi.stubEnv('NODE_ENV', 'staging');
  expect(checkNodeEnvIfSet()).toContain('NODE_ENV should be one of');
});

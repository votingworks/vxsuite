import { beforeEach, afterEach, describe, expect, vi, test } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getEnvironmentVariable,
  getBooleanEnvVarConfig,
} from './environment_variable.js';

describe('environment flags', () => {
  const { env } = process;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
  });

  test('gets flag details as expected', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      const details = getBooleanEnvVarConfig(flag);
      expect(details.name).toEqual(flag);
    }
  });

  test('flags are undefined by default', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      expect(getEnvironmentVariable(flag)).toEqual(undefined);
    }
  });

  test('flags are true as appropriate', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      process.env[flag] = 'TRUE';
      expect(getEnvironmentVariable(flag)).toEqual('TRUE');
    }
  });

  afterEach(() => {
    process.env = env;
  });
});

import { afterEach, describe, expect, vi, test } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getEnvironmentVariable,
  getBooleanEnvVarConfig,
} from './environment_variable';

describe('environment flags', () => {
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
      vi.stubEnv(flag, 'TRUE');
      expect(getEnvironmentVariable(flag)).toEqual('TRUE');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

import {
  BooleanEnvironmentVariableName,
  getEnvironmentVariable,
  getBooleanEnvVarConfig,
  getStringEnvVarConfig,
  StringEnvironmentVariableName,
} from './environment_variable';

describe('environment flags', () => {
  const { env } = process;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  it('gets flag details as expected', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      const details = getBooleanEnvVarConfig(flag);
      expect(details.name).toBe(flag);
    }
  });

  it('gets string env var details as expected', () => {
    for (const flag of Object.values(StringEnvironmentVariableName)) {
      const details = getStringEnvVarConfig(flag);
      expect(details.name).toBe(flag);
    }
  });

  it('flags are undefined by default', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      expect(getEnvironmentVariable(flag)).toBe(undefined);
    }
    for (const flag of Object.values(StringEnvironmentVariableName)) {
      expect(getEnvironmentVariable(flag)).toBe(undefined);
    }
  });

  it('flags are true as appropriate', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      process.env[flag] = 'TRUE';
      expect(getEnvironmentVariable(flag)).toBe('TRUE');
    }
  });

  afterEach(() => {
    process.env = env;
  });
});

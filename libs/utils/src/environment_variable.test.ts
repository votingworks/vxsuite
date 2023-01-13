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
      expect(details.name).toEqual(flag);
    }
  });

  it('gets string env var details as expected', () => {
    for (const flag of Object.values(StringEnvironmentVariableName)) {
      const details = getStringEnvVarConfig(flag);
      expect(details.name).toEqual(flag);
    }
  });

  it('flags are undefined by default', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      expect(getEnvironmentVariable(flag)).toEqual(undefined);
    }
    for (const flag of Object.values(StringEnvironmentVariableName)) {
      expect(getEnvironmentVariable(flag)).toEqual(undefined);
    }
  });

  it('flags are true as appropriate', () => {
    for (const flag of Object.values(BooleanEnvironmentVariableName)) {
      process.env[flag] = 'TRUE';
      expect(getEnvironmentVariable(flag)).toEqual('TRUE');
    }
  });

  afterEach(() => {
    process.env = env;
  });
});

import {
  EnvironmentFlagName,
  getFlag,
  getFlagDetails,
} from './environment_flag';

describe('environment flags', () => {
  const { env } = process;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  it('gets flag details as expected', () => {
    for (const flag of Object.values(EnvironmentFlagName)) {
      const details = getFlagDetails(flag);
      expect(details.name).toBe(flag);
    }
  });

  it('flags are undefined by default', () => {
    for (const flag of Object.values(EnvironmentFlagName)) {
      expect(getFlag(flag)).toBe(undefined);
    }
  });

  it('flags are true as appropriate', () => {
    for (const flag of Object.values(EnvironmentFlagName)) {
      process.env[flag] = 'TRUE';
      expect(getFlag(flag)).toBe('TRUE');
    }
  });

  afterEach(() => {
    process.env = env;
  });
});

import { EnvironmentFlagName } from './environment_flag';
import { isFeatureFlagEnabled, isVxDev } from './features';

describe('features', () => {
  const { env } = process;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
  });

  it('isVxDev returns true when expected', () => {
    process.env['REACT_APP_VX_DEV'] = 'TRUE';
    expect(isVxDev()).toBe(true);
  });

  it('isVxDev returns false when expected', () => {
    expect(isVxDev()).toBe(false);
    process.env['REACT_APP_VX_DEV'] = 'FALSE';
    expect(isVxDev()).toBe(false);
  });

  it('isFeatureFlagEnabled returns true when enabled in dev', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'TRUE';
    expect(
      isFeatureFlagEnabled(EnvironmentFlagName.DISABLE_CARD_READER_CHECK)
    ).toBe(true);
  });

  it('isFeatureFlagEnabled returns false when enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'TRUE';
    expect(
      isFeatureFlagEnabled(EnvironmentFlagName.DISABLE_CARD_READER_CHECK)
    ).toBe(false);
  });

  it('isFeatureFlagEnabled returns true when enabled in VxDev', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'TRUE';
    process.env.REACT_APP_VX_DEV = 'TRUE';
    expect(
      isFeatureFlagEnabled(EnvironmentFlagName.DISABLE_CARD_READER_CHECK)
    ).toBe(true);
  });

  it('isFeatureFlagEnabled returns false when disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'FALSE';
    expect(
      isFeatureFlagEnabled(EnvironmentFlagName.DISABLE_CARD_READER_CHECK)
    ).toBe(false);
  });

  afterEach(() => {
    process.env = env;
  });
});

import { BooleanEnvironmentVariableName } from './environment_variable';
import {
  getConverterClientType,
  isFeatureFlagEnabled,
  isVxDev,
} from './features';

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
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.DISABLE_CARD_READER_CHECK
      )
    ).toBe(true);
  });

  it('isFeatureFlagEnabled returns false when enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'TRUE';
    expect(
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.DISABLE_CARD_READER_CHECK
      )
    ).toBe(false);
  });

  it('isFeatureFlagEnabled returns true when enabled in VxDev', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'TRUE';
    process.env.REACT_APP_VX_DEV = 'TRUE';
    expect(
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.DISABLE_CARD_READER_CHECK
      )
    ).toBe(true);
  });

  it('isFeatureFlagEnabled returns false when disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_DISABLE_CARD_READER_CHECK = 'FALSE';
    expect(
      isFeatureFlagEnabled(
        BooleanEnvironmentVariableName.DISABLE_CARD_READER_CHECK
      )
    ).toBe(false);
  });

  it('getConverterClientType returns value when set', () => {
    process.env.REACT_APP_VX_CONVERTER = 'ms-sems';
    expect(getConverterClientType()).toBe('ms-sems');
  });

  it('getConverterClientType returns undefined when not set', () => {
    expect(getConverterClientType()).toBe(undefined);
  });

  it('getConverterClientType throws error when set to invalid value', () => {
    process.env.REACT_APP_VX_CONVERTER = 'invalid';
    expect(() => getConverterClientType()).toThrowError();
  });

  afterEach(() => {
    process.env = env;
  });
});

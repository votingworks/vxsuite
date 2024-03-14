import { BooleanEnvironmentVariableName } from './environment_variable';
import {
  getConverterClientType,
  isFeatureFlagEnabled,
  isVxDev,
} from './features';

describe('features', () => {
  const { env } = process;

  beforeEach(() => {
    // jest.resetModules();
    process.env = { ...env };
  });

  it('isVxDev returns true when expected', () => {
    process.env['REACT_APP_VX_DEV'] = 'TRUE';
    expect(isVxDev()).toEqual(true);
  });

  it('isVxDev returns false when expected', () => {
    expect(isVxDev()).toEqual(false);
    process.env['REACT_APP_VX_DEV'] = 'FALSE';
    expect(isVxDev()).toEqual(false);
  });

  it('isFeatureFlagEnabled returns true when enabled in dev', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  it('isFeatureFlagEnabled returns false when enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  it('isFeatureFlagEnabled returns true when enabled in VxDev', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    process.env.REACT_APP_VX_DEV = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  it('isFeatureFlagEnabled returns true when enabled in integration tests', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    process.env.IS_INTEGRATION_TEST = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);

    process.env.IS_INTEGRATION_TEST = 'FALSE';
  });

  it('isFeatureFlagEnabled returns false when disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'FALSE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  it('getConverterClientType returns value when set', () => {
    process.env.REACT_APP_VX_CONVERTER = 'ms-sems';
    expect(getConverterClientType()).toEqual('ms-sems');
  });

  it('getConverterClientType returns undefined when not set', () => {
    expect(getConverterClientType()).toEqual(undefined);
  });

  it('getConverterClientType throws error when set to invalid value', () => {
    process.env.REACT_APP_VX_CONVERTER = 'invalid';
    expect(() => getConverterClientType()).toThrowError();
  });

  afterEach(() => {
    process.env = env;
  });
});

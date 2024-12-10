import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from './environment_variable.js';
import { isFeatureFlagEnabled, isVxDev } from './features.js';

describe('features', () => {
  const { env } = process;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
  });

  test('isVxDev returns true when expected', () => {
    process.env['REACT_APP_VX_DEV'] = 'TRUE';
    expect(isVxDev()).toEqual(true);
  });

  test('isVxDev returns false when expected', () => {
    expect(isVxDev()).toEqual(false);
    process.env['REACT_APP_VX_DEV'] = 'FALSE';
    expect(isVxDev()).toEqual(false);
  });

  test('isFeatureFlagEnabled returns true when enabled in dev', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  test('isFeatureFlagEnabled returns false when enabled in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  test('isFeatureFlagEnabled returns true when enabled in VxDev', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    process.env.REACT_APP_VX_DEV = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  test('isFeatureFlagEnabled returns true when enabled in integration tests', () => {
    process.env.NODE_ENV = 'production';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'TRUE';
    process.env.IS_INTEGRATION_TEST = 'TRUE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);

    process.env.IS_INTEGRATION_TEST = 'FALSE';
  });

  test('isFeatureFlagEnabled returns false when disabled', () => {
    process.env.NODE_ENV = 'development';
    process.env.REACT_APP_VX_ENABLE_DEV_DOCK = 'FALSE';
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  afterEach(() => {
    process.env = env;
  });
});

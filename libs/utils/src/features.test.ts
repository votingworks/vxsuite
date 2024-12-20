import { afterEach, describe, expect, test, vi } from 'vitest';
import { BooleanEnvironmentVariableName } from './environment_variable';
import { isFeatureFlagEnabled, isVxDev } from './features';

describe('features', () => {
  test('isVxDev returns true when expected', () => {
    vi.stubEnv('REACT_APP_VX_DEV', 'TRUE');
    expect(isVxDev()).toEqual(true);
  });

  test('isVxDev returns false when expected', () => {
    expect(isVxDev()).toEqual(false);
    vi.stubEnv('REACT_APP_VX_DEV', 'FALSE');
    expect(isVxDev()).toEqual(false);
  });

  test('isFeatureFlagEnabled returns true when enabled in dev', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('REACT_APP_VX_ENABLE_DEV_DOCK', 'TRUE');
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  test('isFeatureFlagEnabled returns false when enabled in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REACT_APP_VX_ENABLE_DEV_DOCK', 'TRUE');
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  test('isFeatureFlagEnabled returns true when enabled in VxDev', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REACT_APP_VX_ENABLE_DEV_DOCK', 'TRUE');
    vi.stubEnv('REACT_APP_VX_DEV', 'TRUE');
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);
  });

  test('isFeatureFlagEnabled returns true when enabled in integration tests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REACT_APP_VX_ENABLE_DEV_DOCK', 'TRUE');
    vi.stubEnv('IS_INTEGRATION_TEST', 'TRUE');
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(true);

    vi.stubEnv('IS_INTEGRATION_TEST', 'FALSE');
  });

  test('isFeatureFlagEnabled returns false when disabled', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('REACT_APP_VX_ENABLE_DEV_DOCK', 'FALSE');
    expect(
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.ENABLE_DEV_DOCK)
    ).toEqual(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

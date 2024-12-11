import { expect, test } from 'vitest';
import { BooleanEnvironmentVariableName } from './environment_variable';
import { isFeatureFlagEnabled } from './features';
import { getFeatureFlagMock } from './features_mock';

test('getFeatureFlagMock allows mocking a flag', () => {
  const featureFlagMock = getFeatureFlagMock();
  const isFeatureFlagEnabledMock = featureFlagMock.isEnabled;

  // initially we match the environment variables
  for (const flag of Object.values(BooleanEnvironmentVariableName)) {
    expect(isFeatureFlagEnabled(flag)).toEqual(isFeatureFlagEnabledMock(flag));
  }

  const testFlag = BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK;
  expect(isFeatureFlagEnabled(testFlag)).toEqual(false);

  // enable
  featureFlagMock.enableFeatureFlag(testFlag);
  expect(isFeatureFlagEnabledMock(testFlag)).toEqual(true);

  // disable
  featureFlagMock.disableFeatureFlag(testFlag);
  expect(isFeatureFlagEnabledMock(testFlag)).toEqual(false);

  // test that mocks are independent, allowing different behavior across test suites
  const featureFlagMock2 = getFeatureFlagMock();
  const isFeatureFlagEnabledMock2 = featureFlagMock2.isEnabled;
  featureFlagMock.enableFeatureFlag(testFlag);
  expect(isFeatureFlagEnabledMock(testFlag)).toEqual(true);
  expect(isFeatureFlagEnabledMock2(testFlag)).toEqual(false);
});

test('resetFeatureFlags can reset all flags at once', () => {
  const featureFlagMock = getFeatureFlagMock();
  const isFeatureFlagEnabledMock = featureFlagMock.isEnabled;

  const testFlag1 =
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION;
  const testFlag2 = BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK;
  expect(isFeatureFlagEnabledMock(testFlag1)).toEqual(false);
  expect(isFeatureFlagEnabledMock(testFlag2)).toEqual(false);

  featureFlagMock.enableFeatureFlag(testFlag1);
  featureFlagMock.enableFeatureFlag(testFlag2);
  expect(isFeatureFlagEnabledMock(testFlag1)).toEqual(true);
  expect(isFeatureFlagEnabledMock(testFlag2)).toEqual(true);

  featureFlagMock.resetFeatureFlags();
  expect(isFeatureFlagEnabledMock(testFlag1)).toEqual(false);
  expect(isFeatureFlagEnabledMock(testFlag2)).toEqual(false);
});

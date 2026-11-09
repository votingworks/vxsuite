import { afterEach, expect, test, vi } from 'vitest';
import { stateFeatureConfigs } from '@votingworks/election-definition-backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  getMachineState,
  isElectionDefinitionEnabled,
  parseStateCode,
} from './state.js';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  featureFlagMock.resetFeatureFlags();
});

test('parseStateCode', () => {
  expect(parseStateCode('DEMO')).toEqual('DEMO');
  expect(parseStateCode('demo')).toEqual('DEMO');
  expect(parseStateCode('mi')).toEqual('MI');
  expect(parseStateCode('NH')).toEqual('NH');
  expect(parseStateCode('vx')).toEqual(undefined);
  expect(parseStateCode('')).toEqual(undefined);
});

test('getMachineState', () => {
  vi.stubEnv('VX_MACHINE_STATE', 'demo');
  expect(getMachineState()).toEqual({
    stateCode: 'DEMO',
    features: {
      ...stateFeatureConfigs.DEMO,
      AUDIO_ENABLED: false,
      BALLOT_LANGUAGE_CONFIG: false,
    },
  });

  vi.stubEnv('VX_MACHINE_STATE', 'MI');
  expect(getMachineState()).toEqual(undefined);

  vi.stubEnv('VX_MACHINE_STATE', 'somewhere');
  expect(getMachineState()).toEqual(undefined);
});

test('getMachineState defaults to the demo state outside of production', () => {
  expect(getMachineState()?.stateCode).toEqual('DEMO');

  vi.stubEnv('NODE_ENV', 'production');
  expect(getMachineState()).toEqual(undefined);

  vi.stubEnv('VX_MACHINE_STATE', 'DEMO');
  expect(getMachineState()?.stateCode).toEqual('DEMO');
});

test('isElectionDefinitionEnabled', () => {
  vi.stubEnv('VX_MACHINE_STATE', 'DEMO');
  expect(isElectionDefinitionEnabled()).toEqual(false);

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  expect(isElectionDefinitionEnabled()).toEqual(true);

  vi.stubEnv('VX_MACHINE_STATE', 'MI');
  expect(isElectionDefinitionEnabled()).toEqual(false);
});

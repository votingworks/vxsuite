import { afterEach, expect, test, vi } from 'vitest';
import { stateFeatureConfigs } from '@votingworks/election-definition-backend';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  getMachineState,
  isElectionDefinitionEnabled,
  stateCodeForJurisdiction,
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

test('stateCodeForJurisdiction', () => {
  expect(stateCodeForJurisdiction('vx.test')).toEqual('DEMO');
  expect(stateCodeForJurisdiction('mi.kent')).toEqual('MI');
  expect(stateCodeForJurisdiction('nh.concord')).toEqual('NH');
  expect(stateCodeForJurisdiction('demo.county')).toEqual(undefined);
  expect(stateCodeForJurisdiction('st.somewhere')).toEqual(undefined);
  expect(stateCodeForJurisdiction('jurisdiction')).toEqual(undefined);
});

test('getMachineState', () => {
  vi.stubEnv('VX_MACHINE_JURISDICTION', 'vx.test');
  expect(getMachineState()).toEqual({
    stateCode: 'DEMO',
    features: {
      ...stateFeatureConfigs.DEMO,
      AUDIO_ENABLED: false,
      BALLOT_LANGUAGE_CONFIG: false,
    },
  });

  vi.stubEnv('VX_MACHINE_JURISDICTION', 'mi.kent');
  expect(getMachineState()).toEqual(undefined);

  vi.stubEnv('VX_MACHINE_JURISDICTION', 'st.somewhere');
  expect(getMachineState()).toEqual(undefined);
});

test('isElectionDefinitionEnabled', () => {
  vi.stubEnv('VX_MACHINE_JURISDICTION', 'vx.test');
  expect(isElectionDefinitionEnabled()).toEqual(false);

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  expect(isElectionDefinitionEnabled()).toEqual(true);

  vi.stubEnv('VX_MACHINE_JURISDICTION', 'mi.kent');
  expect(isElectionDefinitionEnabled()).toEqual(false);
});

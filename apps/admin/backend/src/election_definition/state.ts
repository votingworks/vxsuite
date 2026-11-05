import { assertDefined } from '@votingworks/basics';
import {
  getStateFeaturesConfig,
  type StateCode,
  StateCodes,
  type StateFeaturesConfig,
} from '@votingworks/election-definition-backend';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { getMachineJurisdiction } from '../machine_config.js';

const VOTINGWORKS_STATE = 'vx';

const SUPPORTED_STATE_CODES: readonly StateCode[] = ['DEMO'];

/** The machine's state and its election definition features. */
export interface MachineState {
  stateCode: StateCode;
  features: StateFeaturesConfig;
}

/** Derives a state code from a `{state}.{county}` jurisdiction. */
export function stateCodeForJurisdiction(
  jurisdiction: string
): StateCode | undefined {
  const state = assertDefined(jurisdiction.split('.')[0]);
  if (state === VOTINGWORKS_STATE) {
    return 'DEMO';
  }
  return StateCodes.find(
    (stateCode) => stateCode !== 'DEMO' && stateCode === state.toUpperCase()
  );
}

/** Returns the machine's state if election definition supports it. */
export function getMachineState(): MachineState | undefined {
  const stateCode = stateCodeForJurisdiction(getMachineJurisdiction());
  if (!stateCode || !SUPPORTED_STATE_CODES.includes(stateCode)) {
    return undefined;
  }
  return {
    stateCode,
    features: {
      ...getStateFeaturesConfig({ stateCode }),
      AUDIO_ENABLED: false,
      BALLOT_LANGUAGE_CONFIG: false,
    },
  };
}

/**
 * Returns whether election definition is available: its feature flag is on
 * and the machine's state is supported.
 */
export function isElectionDefinitionEnabled(): boolean {
  return (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
    ) && getMachineState() !== undefined
  );
}

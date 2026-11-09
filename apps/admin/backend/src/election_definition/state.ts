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
import { getMachineStateSetting } from '../machine_config.js';

const SUPPORTED_STATE_CODES: readonly StateCode[] = ['DEMO'];

/** The machine's state and its election definition features. */
export interface MachineState {
  stateCode: StateCode;
  features: StateFeaturesConfig;
}

/** Parses a configured state setting, e.g. `DEMO` or `mi`, as a state code. */
export function parseStateCode(setting: string): StateCode | undefined {
  return StateCodes.find((stateCode) => stateCode === setting.toUpperCase());
}

/** Returns the machine's state if election definition supports it. */
export function getMachineState(): MachineState | undefined {
  const setting = getMachineStateSetting();
  const stateCode = setting === undefined ? undefined : parseStateCode(setting);
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

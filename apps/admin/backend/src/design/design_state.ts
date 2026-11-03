import { join } from 'node:path';
import {
  getDevStateCodeOverrideDir,
  readDevStateCodeOverride,
} from '@votingworks/backend';
import { type StateCode, StateCodes } from '@votingworks/types';
import { isNodeEnvProduction } from '@votingworks/utils';
import { getMachineJurisdiction } from '../machine_config.js';

const DEV_STATE_CODE_OVERRIDE_DIR = getDevStateCodeOverrideDir(
  join(import.meta.dirname, '../../../../..')
);

const VOTINGWORKS_TEST_STATE = 'vx';

export type MachineDesignState =
  | { status: 'supported'; stateCode: StateCode }
  | { status: 'unsupported'; jurisdiction: string };

export function stateCodeForJurisdiction(
  jurisdiction: string
): StateCode | undefined {
  const [state] = jurisdiction.split('.');
  if (!state) return undefined;
  if (state === VOTINGWORKS_TEST_STATE) return 'DEMO';
  const stateCode = state.toUpperCase();
  return StateCodes.find((code) => code === stateCode && code !== 'DEMO');
}

export function getMachineDesignState(): MachineDesignState {
  if (!isNodeEnvProduction()) {
    const override = readDevStateCodeOverride(DEV_STATE_CODE_OVERRIDE_DIR);
    if (override) return { status: 'supported', stateCode: override };
  }
  const jurisdiction = getMachineJurisdiction();
  const stateCode = stateCodeForJurisdiction(jurisdiction);
  return stateCode
    ? { status: 'supported', stateCode }
    : { status: 'unsupported', jurisdiction };
}

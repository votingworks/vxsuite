import {
  getStateFeaturesConfig,
  type Jurisdiction,
  type StateFeaturesConfig,
} from '@votingworks/design-backend';
import { LATEST_SOFTWARE_VERSION, type StateCode } from '@votingworks/types';
import { LOCAL_JURISDICTION_ID } from './design_store.js';

export const LOCAL_ORGANIZATION_ID = 'vxadmin-local';
export const LOCAL_ORGANIZATION_NAME = 'VxAdmin';
export const LOCAL_JURISDICTION_NAME = 'Local Jurisdiction';

export function localJurisdiction(stateCode: StateCode): Jurisdiction {
  return {
    id: LOCAL_JURISDICTION_ID,
    name: LOCAL_JURISDICTION_NAME,
    stateCode,
    softwareVersion: LATEST_SOFTWARE_VERSION,
    organization: { id: LOCAL_ORGANIZATION_ID, name: LOCAL_ORGANIZATION_NAME },
  };
}

export function englishOnlyStateFeatures(
  stateCode: StateCode
): StateFeaturesConfig {
  return {
    ...getStateFeaturesConfig({ stateCode }),
    AUDIO_ENABLED: false,
    BALLOT_LANGUAGE_CONFIG: false,
  };
}

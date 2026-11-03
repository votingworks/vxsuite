import {
  type DesignFeaturesProvider,
  getStateFeaturesConfig,
  type Jurisdiction,
  type StateFeaturesConfig,
} from '@votingworks/design-backend';
import { LATEST_SOFTWARE_VERSION, type StateCode } from '@votingworks/types';
import {
  LOCAL_JURISDICTION_ID,
  LOCAL_JURISDICTION_NAME,
  LOCAL_ORGANIZATION_ID,
  LOCAL_ORGANIZATION_NAME,
} from './design_db.js';

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

export function createAdminDesignFeatures(
  stateCode: StateCode
): DesignFeaturesProvider {
  return {
    getJurisdiction: () => Promise.resolve(localJurisdiction(stateCode)),
    getStateFeatures: () =>
      Promise.resolve(englishOnlyStateFeatures(stateCode)),
  };
}

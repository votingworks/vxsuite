import {
  type DesignFeaturesProvider,
  getStateFeaturesConfig,
} from '@votingworks/design-backend';
import type { Store } from './store.js';

export function createHubDesignFeatures(store: Store): DesignFeaturesProvider {
  return {
    getJurisdiction: (jurisdictionId) => store.getJurisdiction(jurisdictionId),
    getStateFeatures: async (electionId) =>
      getStateFeaturesConfig(await store.getElectionJurisdiction(electionId)),
  };
}

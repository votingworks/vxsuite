import React, { createContext, useContext } from 'react';
import { assertDefined } from '@votingworks/basics';
import { getElection } from './api';

export enum FeatureName {
  BALLOT_BUBBLE_SIDE = 'BALLOT_BUBBLE_SIDE',
}

export type FeaturesEnabledRecord = Record<FeatureName, boolean>;

export const DEFAULT_ENABLED_FEATURES: FeaturesEnabledRecord = {
  BALLOT_BUBBLE_SIDE: false,
};

export const NH_ENABLED_FEATURES: FeaturesEnabledRecord = {
  BALLOT_BUBBLE_SIDE: true,
};

const FeaturesContext = createContext<FeaturesEnabledRecord>(
  DEFAULT_ENABLED_FEATURES
);

export function useFeaturesContext(): FeaturesEnabledRecord {
  return assertDefined(
    useContext(FeaturesContext),
    'useFeatures must be used within a FeaturesProvider'
  );
}

interface FeaturesProviderProps {
  children: React.ReactNode;
  electionId?: string;
}

export function FeaturesProvider({
  children,
  electionId,
}: FeaturesProviderProps): JSX.Element {
  if (!electionId) {
    return (
      <FeaturesContext.Provider value={DEFAULT_ENABLED_FEATURES}>
        {children}
      </FeaturesContext.Provider>
    );
  }

  const getElectionQuery = getElection.useQuery(electionId);
  let features = DEFAULT_ENABLED_FEATURES;

  if (getElectionQuery.isSuccess) {
    const { election } = getElectionQuery.data;
    const electionState = election.state.toLowerCase();
    // TODO expand to include vx or SLI users who should have access to all features.
    // Blocked on auth implementation.
    switch (electionState) {
      case 'nh':
      case 'new hampshire':
        features = NH_ENABLED_FEATURES;
        break;
      default:
        features = DEFAULT_ENABLED_FEATURES;
    }
  }

  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
}

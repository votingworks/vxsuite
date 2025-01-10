import React, { createContext, useContext } from 'react';
import { getElection } from './api';

export enum FeatureName {
  BALLOT_BUBBLE_SIDE = 'BALLOT_BUBBLE_SIDE',
}

export type FeaturesEnabledRecord = Record<FeatureName, boolean>;

const DEFAULT_ENABLED_FEATURES: FeaturesEnabledRecord = {
  BALLOT_BUBBLE_SIDE: false,
};

const NH_ENABLED_FEATURES: FeaturesEnabledRecord = {
  BALLOT_BUBBLE_SIDE: true,
};

const FeaturesContext = createContext<FeaturesEnabledRecord>(
  DEFAULT_ENABLED_FEATURES
);

export function useFeatures(): FeaturesEnabledRecord {
  const context = useContext(FeaturesContext);
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
}

interface FeaturesProviderProps {
  children: React.ReactNode;
  electionId: string;
}

export function FeaturesProvider({
  children,
  electionId,
}: FeaturesProviderProps): JSX.Element {
  const getElectionQuery = getElection.useQuery(electionId);
  let features = DEFAULT_ENABLED_FEATURES;

  if (getElectionQuery.isSuccess) {
    const { election } = getElectionQuery.data;
    // TODO expand to include vx or SLI users who should have access to all features.
    // Blocked on auth implementation.
    if (election.state.toLowerCase() === 'nh') {
      features = NH_ENABLED_FEATURES;
    }
  }

  return (
    <FeaturesContext.Provider value={features}>
      {children}
    </FeaturesContext.Provider>
  );
}

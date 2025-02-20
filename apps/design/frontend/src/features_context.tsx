import React, { createContext, useContext } from 'react';
import { assertDefined } from '@votingworks/basics';
import { ElectionId } from '@votingworks/types';
import { getElection, getUser } from './api';

/**
 * Features that should be enabled based on the user's organization - i.e.
 * differentiating between what VX support users can do and what election
 * officials can do.
 */
enum UserFeature {
  /**
   * Allow the user to access all elections across all organizations.
   */
  ACCESS_ALL_ORGS = 'ACCESS_ALL_ORGS',
  /**
   * Show the System Settings screen.
   */
  SYSTEM_SETTINGS_SCREEN = 'SYSTEM_SETTINGS_SCREEN',
  /**
   * Show the export screen.
   */
  EXPORT_SCREEN = 'EXPORT_SCREEN',
  /**
   * Only allow selecting Letter and Legal paper sizes for ballots.
   */
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES = 'ONLY_LETTER_AND_LEGAL_PAPER_SIZES',
  /**
   * Allow the user to create an election.
   */
  CREATE_ELECTION = 'CREATE_ELECTION',
  /**
   * Allow the user to delete an election.
   */
  DELETE_ELECTION = 'DELETE_ELECTION',
  /**
   * Allow the user to create and delete districts. The goal of this feature
   * flag is to prevent users from accidentally messing up preset districts.
   */
  CREATE_DELETE_DISTRICTS = 'CREATE_DELETE_DISTRICTS',
  /**
   * Allow the user to create and delete precincts. The goal of this feature
   * flag is to prevent users from accidentally messing up preset precincts.
   */
  CREATE_DELETE_PRECINCTS = 'CREATE_DELETE_PRECINCTS',
  /**
   * Allow the user to change the splits for a precinct split. The goal of
   * this feature flag is to prevent users from accidentally messing up preset
   * precinct splits.
   */
  CREATE_DELETE_PRECINCT_SPLITS = 'CREATE_DELETE_PRECINCT_SPLITS',
}

/**
 * Features that should be enabled based on the organization of the election
 * currently being viewed. VX support users and election officials should all
 * have the same functionality for these features when viewing a specific
 * election.
 */
enum ElectionFeature {
  /**
   * Add a field to override the election title for a precinct split.
   */
  PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE = 'PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE',
  /**
   * Add a field to override the election seal for a precinct split.
   */
  PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE = 'PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE',
  /**
   * Add a field to upload a clerk signature image for a precinct split.
   */
  PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE = 'PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE',
  /**
   * Add a field to enter a caption for the clerk signature image for a precinct split.
   */
  PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION = 'PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION',
}

export type UserFeaturesConfig = Record<UserFeature, boolean>;
export type ElectionFeaturesConfig = Record<ElectionFeature, boolean>;

interface FeaturesConfig {
  user: UserFeaturesConfig;
  election?: ElectionFeaturesConfig;
}

export const userFeatureConfigs = {
  vx: {
    ACCESS_ALL_ORGS: true,
    SYSTEM_SETTINGS_SCREEN: true,
    EXPORT_SCREEN: true,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: false,
    CREATE_ELECTION: true,
    DELETE_ELECTION: true,
    CREATE_DELETE_DISTRICTS: true,
    CREATE_DELETE_PRECINCTS: true,
    CREATE_DELETE_PRECINCT_SPLITS: true,
  },
  nh: {
    ACCESS_ALL_ORGS: false,
    SYSTEM_SETTINGS_SCREEN: false,
    EXPORT_SCREEN: false,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
    CREATE_ELECTION: false,
    DELETE_ELECTION: false,
    CREATE_DELETE_DISTRICTS: false,
    CREATE_DELETE_PRECINCTS: false,
    CREATE_DELETE_PRECINCT_SPLITS: false,
  },
} satisfies Record<string, UserFeaturesConfig>;

export const electionFeatureConfigs = {
  // VX sandbox elections should have not have any state-specific features
  // enabled
  vx: {
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: false,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: false,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE: false,
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION: false,
  },

  nh: {
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION: true,
  },
} satisfies Record<string, ElectionFeaturesConfig>;

const FeaturesContext = createContext<FeaturesConfig | undefined>(undefined);

/**
 * When not in the context of a specific election, use UserFeaturesProvider to
 * provide {@link UserFeature} flags.
 */
export function UserFeaturesProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element | null {
  const getUserQuery = getUser.useQuery();
  if (!getUserQuery.isSuccess) {
    return null;
  }

  // TODO: Eventually we'll want to map user org IDs to feature configs (likely
  // on the backend), but for now we just use a flag to differentiate between
  // VX and NH users.
  const userFeatures = getUserQuery.data.isVotingWorksUser
    ? userFeatureConfigs.vx
    : userFeatureConfigs.nh;

  return (
    <FeaturesContext.Provider value={{ user: userFeatures }}>
      {children}
    </FeaturesContext.Provider>
  );
}

interface FeaturesProviderProps {
  children: React.ReactNode;
  electionId: ElectionId;
}

/**
 * When in the context of a specific election, use FeaturesProvider to provide both
 * {@link UserFeature} and {@link ElectionFeature} flags.
 */
export function FeaturesProvider({
  children,
  electionId,
}: FeaturesProviderProps): JSX.Element | null {
  const getUserQuery = getUser.useQuery();
  const getElectionQuery = getElection.useQuery(electionId);
  if (!(getUserQuery.isSuccess && getElectionQuery.isSuccess)) {
    return null;
  }

  // TODO: Eventually we'll want to map user org IDs to feature configs (likely
  // on the backend), but for now we just use a flag to differentiate between
  // VX and NH users.
  const userFeatures = getUserQuery.data.isVotingWorksUser
    ? userFeatureConfigs.vx
    : userFeatureConfigs.nh;
  const electionFeatures =
    getUserQuery.data.isVotingWorksUser &&
    getElectionQuery.data.orgId === getUserQuery.data.orgId
      ? electionFeatureConfigs.vx
      : electionFeatureConfigs.nh;

  return (
    <FeaturesContext.Provider
      value={{ user: userFeatures, election: electionFeatures }}
    >
      {children}
    </FeaturesContext.Provider>
  );
}

function useFeatures(): FeaturesConfig {
  return assertDefined(
    useContext(FeaturesContext),
    'useFeatures must be used within a FeaturesProvider'
  );
}

export function useUserFeatures(): UserFeaturesConfig {
  const features = useFeatures();
  return features.user;
}

export function useElectionFeatures(): ElectionFeaturesConfig {
  const features = useFeatures();
  return assertDefined(
    features.election,
    'Must pass electionId to FeaturesProvider to access election features'
  );
}

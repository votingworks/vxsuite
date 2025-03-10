import React, { createContext, useContext } from 'react';
import { assertDefined } from '@votingworks/basics';
import { ElectionId } from '@votingworks/types';
import { User } from '@votingworks/design-backend';
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
   * Show the System Settings "Marginal Mark Threshold" option.
   * If enabled, also requires SYSTEM_SETTINGS_SCREEN.
   */
  MARGINAL_MARK_THRESHOLD = 'MARGINAL_MARK_THRESHOLD',
  /**
   * Show the export screen.
   */
  EXPORT_SCREEN = 'EXPORT_SCREEN',
  /**
   * Show the ballot template picker on the export screen.
   * If enabled, also requires EXPORT_SCREEN.
   */
  CHOOSE_BALLOT_TEMPLATE = 'CHOOSE_BALLOT_TEMPLATE',
  /**
   * Show the "Export Test Decks" button on the export screen.
   * If enabled, also requires EXPORT_SCREEN.
   */
  EXPORT_TEST_DECKS = 'EXPORT_TEST_DECKS',
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
  /**
   * Allow the user to select ballot languages.
   */
  BALLOT_LANGUAGE_CONFIG = 'BALLOT_LANGUAGE_CONFIG',
  /**
   * Show the user a toggle that allows them to include audio files in
   * ballot and election package export.
   */
  EXPORT_AUDIO_TOGGLE = 'EXPORT_AUDIO_TOGGLE',
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
    CHOOSE_BALLOT_TEMPLATE: true,
    EXPORT_TEST_DECKS: true,
    MARGINAL_MARK_THRESHOLD: true,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: false,
    CREATE_ELECTION: true,
    DELETE_ELECTION: true,
    CREATE_DELETE_DISTRICTS: true,
    CREATE_DELETE_PRECINCTS: true,
    CREATE_DELETE_PRECINCT_SPLITS: true,
    BALLOT_LANGUAGE_CONFIG: true,
  },
  sli: {
    ACCESS_ALL_ORGS: false,
    SYSTEM_SETTINGS_SCREEN: true,
    MARGINAL_MARK_THRESHOLD: false,
    EXPORT_SCREEN: true,
    CHOOSE_BALLOT_TEMPLATE: false,
    EXPORT_TEST_DECKS: false,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: false,
    CREATE_ELECTION: true,
    DELETE_ELECTION: true,
    CREATE_DELETE_DISTRICTS: true,
    CREATE_DELETE_PRECINCTS: true,
    CREATE_DELETE_PRECINCT_SPLITS: true,
    BALLOT_LANGUAGE_CONFIG: true,
  },
  nh: {
    ACCESS_ALL_ORGS: false,
    SYSTEM_SETTINGS_SCREEN: false,
    MARGINAL_MARK_THRESHOLD: false,
    EXPORT_SCREEN: false,
    CHOOSE_BALLOT_TEMPLATE: false,
    // EXPORT_TEST_DECKS is currently a no-op because export screen is off, but NH users should be able
    // to export test decks when export screen is turned on.
    EXPORT_TEST_DECKS: true,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
    CREATE_ELECTION: false,
    DELETE_ELECTION: false,
    CREATE_DELETE_DISTRICTS: false,
    CREATE_DELETE_PRECINCTS: false,
    CREATE_DELETE_PRECINCT_SPLITS: false,
    BALLOT_LANGUAGE_CONFIG: false,
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

  sli: {
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

// TODO: Eventually we'll want to map user org IDs to feature configs (likely
// on the backend).
function getUserFeatureConfig(user: User) {
  if (user.isVotingWorksUser) {
    return userFeatureConfigs.vx;
  }
  if (user.isSliUser) {
    return userFeatureConfigs.sli;
  }

  return userFeatureConfigs.nh;
}

function getElectionFeatureConfig(user: User, electionOrgId: string) {
  if (user.isVotingWorksUser && user.orgId === electionOrgId) {
    return electionFeatureConfigs.vx;
  }
  if (user.isSliUser) {
    return electionFeatureConfigs.sli;
  }
  return electionFeatureConfigs.nh;
}

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

  const user = getUserQuery.data;
  const userFeatures = getUserFeatureConfig(user);

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

  const user = getUserQuery.data;
  // TODO: Eventually we'll want to map user org IDs to feature configs (likely
  // on the backend), but for now we just use a flag to differentiate between
  // VX and NH users.
  const userFeatures = getUserFeatureConfig(user);
  const electionFeatures = getElectionFeatureConfig(
    user,
    getElectionQuery.data.orgId
  );

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

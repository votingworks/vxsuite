import { sliOrgId, votingWorksOrgId, vxDemosOrgId } from './globals';
import { ElectionRecord } from './store';
import { User } from './types';

export function isVxOrSliOrg(orgId: string): boolean {
  return orgId === votingWorksOrgId() || orgId === sliOrgId();
}

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
   * Show the System Settings "Enable BMD Ballot Scanning on VxScan" option.
   * If enabled, also requires SYSTEM_SETTINGS_SCREEN.
   */
  ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE = 'ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE',
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

export const userFeatureConfigs = {
  vx: {
    ACCESS_ALL_ORGS: true,
    SYSTEM_SETTINGS_SCREEN: true,
    EXPORT_SCREEN: true,
    CHOOSE_BALLOT_TEMPLATE: true,
    EXPORT_TEST_DECKS: true,
    MARGINAL_MARK_THRESHOLD: true,
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE: true,
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
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE: false,
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

  demos: {
    ACCESS_ALL_ORGS: false,
    SYSTEM_SETTINGS_SCREEN: true,
    MARGINAL_MARK_THRESHOLD: false,
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE: false,
    EXPORT_SCREEN: true,
    CHOOSE_BALLOT_TEMPLATE: true,
    EXPORT_TEST_DECKS: true,
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
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_TOGGLE: false,
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

export function getUserFeaturesConfig(user: User): UserFeaturesConfig {
  if (user.orgId === votingWorksOrgId()) {
    return userFeatureConfigs.vx;
  }
  if (user.orgId === sliOrgId()) {
    return userFeatureConfigs.sli;
  }
  if (user.orgId === vxDemosOrgId()) {
    return userFeatureConfigs.demos;
  }
  return userFeatureConfigs.nh;
}

export function getElectionFeaturesConfig(
  election: ElectionRecord
): ElectionFeaturesConfig {
  if (election.orgId === votingWorksOrgId()) {
    return electionFeatureConfigs.vx;
  }
  if (election.orgId === sliOrgId()) {
    return electionFeatureConfigs.sli;
  }
  if (election.orgId === vxDemosOrgId()) {
    return electionFeatureConfigs.vx;
  }
  return electionFeatureConfigs.nh;
}

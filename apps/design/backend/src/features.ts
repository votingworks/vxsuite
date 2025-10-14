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
export enum UserFeature {
  /**
   * Allow the user to access all elections across all organizations.
   */
  ACCESS_ALL_ORGS = 'ACCESS_ALL_ORGS',
  /**
   * Show the System Settings screen.
   */
  SYSTEM_SETTINGS_SCREEN = 'SYSTEM_SETTINGS_SCREEN',
  /**
   * Show the System Settings "Enable BMD Ballot Scanning on VxScan" option.
   * If enabled, also requires SYSTEM_SETTINGS_SCREEN.
   */
  ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_OPTION = 'ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_OPTION',
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
   * Allow the user to select ballot languages.
   */
  BALLOT_LANGUAGE_CONFIG = 'BALLOT_LANGUAGE_CONFIG',
  /**
   * Allow the user to toggle the ability to mark overvotes on VxMark.
   */
  BMD_OVERVOTE_ALLOW_TOGGLE = 'BMD_OVERVOTE_ALLOW_TOGGLE',
  /**
   * Allow selection of additional BMD print modes beyond summary ballots.
   */
  BMD_EXTRA_PRINT_MODES = 'BMD_EXTRA_PRINT_MODES',
  /**
   * Allow for configuring the Quick Results Reporting system setting on elections.
   */
  QUICK_RESULTS_REPORTING = 'QUICK_RESULTS_REPORTING',
  /**
   * Enable audio-proofing UI.
   */
  AUDIO_PROOFING = 'AUDIO_PROOFING',
  /**
   * Enable the ability to convert Mississippi SEMS election files.
   */
  MS_SEMS_CONVERSION = 'MS_SEMS_CONVERSION',
}

/**
 * Features that should be enabled based on the organization of the election
 * currently being viewed. VX support users and election officials should all
 * have the same functionality for these features when viewing a specific
 * election.
 */
export enum ElectionFeature {
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
  PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE = 'PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE',
  /**
   * Add a field to enter a caption for the clerk signature image for a precinct split.
   */
  PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE = 'PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE',
}

export type UserFeaturesConfig = Partial<Record<UserFeature, boolean>>;
export type ElectionFeaturesConfig = Partial<Record<ElectionFeature, boolean>>;

export const userFeatureConfigs = {
  vx: {
    ACCESS_ALL_ORGS: true,

    BALLOT_LANGUAGE_CONFIG: true,

    SYSTEM_SETTINGS_SCREEN: true,
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_OPTION: true,
    BMD_OVERVOTE_ALLOW_TOGGLE: true,
    BMD_EXTRA_PRINT_MODES: true,

    EXPORT_SCREEN: true,
    CHOOSE_BALLOT_TEMPLATE: true,
    EXPORT_TEST_DECKS: true,
    QUICK_RESULTS_REPORTING: true,
    AUDIO_PROOFING: true,

    MS_SEMS_CONVERSION: true,
  },

  sli: {
    BALLOT_LANGUAGE_CONFIG: true,
    EXPORT_SCREEN: true,
    SYSTEM_SETTINGS_SCREEN: true,
  },

  demos: {
    BALLOT_LANGUAGE_CONFIG: true,
    CHOOSE_BALLOT_TEMPLATE: true,
    ENABLE_BMD_BALLOT_SCANNING_ON_VXSCAN_OPTION: true,
    EXPORT_SCREEN: true,
    EXPORT_TEST_DECKS: true,
    SYSTEM_SETTINGS_SCREEN: true,
  },

  nh: {
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
  },
} satisfies Record<string, UserFeaturesConfig>;

export const electionFeatureConfigs = {
  // VX sandbox elections should have not have any state-specific features
  // enabled
  vx: {},

  sli: {},

  nh: {
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
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

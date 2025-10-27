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
  //
  // Export screen features
  //

  /**
   * Show the export screen.
   */
  EXPORT_SCREEN = 'EXPORT_SCREEN',
  /**
   * Allow the user to choose a ballot template.
   * Requires the export screen to be enabled.
   */
  CHOOSE_BALLOT_TEMPLATE = 'CHOOSE_BALLOT_TEMPLATE',
  /**
   * Allow the user to export test decks.
   * Requires the export screen to be enabled.
   */
  EXPORT_TEST_DECKS = 'EXPORT_TEST_DECKS',

  //
  // System settings screen features
  //

  /**
   * Show the system settings screen.
   */
  SYSTEM_SETTINGS_SCREEN = 'SYSTEM_SETTINGS_SCREEN',
  /**
   * Allow the user to toggle VxScan's ability to scan BMD ballots.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING = 'VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING',
  /**
   * Allow the user to toggle VxScan's alarms.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_ALARMS_SYSTEM_SETTING = 'VXSCAN_ALARMS_SYSTEM_SETTING',
  /**
   * Allow the user to toggle the ability to mark overvotes on VxMark.
   * Requires the system settings screen to be enabled.
   */
  BMD_OVERVOTE_SYSTEM_SETTING = 'BMD_OVERVOTE_SYSTEM_SETTING',
  /**
   * Allow the user to select BMD print modes beyond summary ballots.
   * Requires the system settings screen to be enabled.
   */
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING = 'BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING',
  /**
   * Allow the user to configure quick results reporting.
   * Requires the system settings screen to be enabled.
   */
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING = 'QUICK_RESULTS_REPORTING_SYSTEM_SETTING',
  /**
   * Allow the user to toggle system limit checks on election package import.
   * Requires the system settings screen to be enabled.
   */
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING = 'SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING',

  //
  // Other features
  //

  /**
   * Allow the user to access all elections across all organizations.
   */
  ACCESS_ALL_ORGS = 'ACCESS_ALL_ORGS',
  /**
   * Only allow selecting letter and legal paper sizes for ballots.
   */
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES = 'ONLY_LETTER_AND_LEGAL_PAPER_SIZES',
  /**
   * Allow the user to select ballot languages.
   */
  BALLOT_LANGUAGE_CONFIG = 'BALLOT_LANGUAGE_CONFIG',
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

const vxUserFeaturesConfig: UserFeaturesConfig = {
  EXPORT_SCREEN: true,
  CHOOSE_BALLOT_TEMPLATE: true,
  EXPORT_TEST_DECKS: true,

  SYSTEM_SETTINGS_SCREEN: true,
  VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING: true,
  VXSCAN_ALARMS_SYSTEM_SETTING: true,
  BMD_OVERVOTE_SYSTEM_SETTING: true,
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING: true,
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING: true,
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING: true,

  ACCESS_ALL_ORGS: true,
  BALLOT_LANGUAGE_CONFIG: true,
  AUDIO_PROOFING: true,
  MS_SEMS_CONVERSION: true,
};

export const userFeatureConfigs = {
  vx: vxUserFeaturesConfig,

  demos: { ...vxUserFeaturesConfig, ACCESS_ALL_ORGS: false },

  sli: {
    EXPORT_SCREEN: true,
    SYSTEM_SETTINGS_SCREEN: true,
    BALLOT_LANGUAGE_CONFIG: true,
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

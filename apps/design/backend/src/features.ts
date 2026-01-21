import { sliOrganizationId, votingWorksOrganizationId } from './globals';
import { Jurisdiction, StateCode, User } from './types';
import { userBelongsToOrganization } from './utils';

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
  /**
   * Allow the user to toggle voter help buttons.
   * Requires the system settings screen to be enabled.
   */
  VOTER_HELP_BUTTONS_SYSTEM_SETTING = 'VOTER_HELP_BUTTONS_SYSTEM_SETTING',
}

/**
 * Features that should be enabled based on the state of the election
 * currently being viewed. VX support users and election officials should all
 * have the same functionality for these features when viewing a specific
 * election.
 */
export enum StateFeature {
  /**
   * Only allow selecting letter and legal paper sizes for ballots.
   */
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES = 'ONLY_LETTER_AND_LEGAL_PAPER_SIZES',
  /**
   * Allow the user to select ballot languages.
   */
  BALLOT_LANGUAGE_CONFIG = 'BALLOT_LANGUAGE_CONFIG',
  /**
   * Enable audio exports and audio-proofing UI.
   */
  AUDIO_ENABLED = 'AUDIO_ENABLED',
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
  /**
   * Include sample ballots in exports.
   */
  EXPORT_SAMPLE_BALLOTS = 'EXPORT_SAMPLE_BALLOTS',
  /**
   * Include test mode ballots in exports.
   */
  EXPORT_TEST_BALLOTS = 'EXPORT_TEST_BALLOTS',
  /**
   * Enable adding/editing headers for ballot contest sections.
   */
  CONTEST_SECTION_HEADERS = 'CONTEST_SECTION_HEADERS',
}

export type UserFeaturesConfig = Partial<Record<UserFeature, boolean>>;
export type StateFeaturesConfig = Partial<Record<StateFeature, boolean>>;

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
  VOTER_HELP_BUTTONS_SYSTEM_SETTING: true,
};

export const userFeatureConfigs = {
  vx: vxUserFeaturesConfig,

  sli: {
    EXPORT_SCREEN: true,
    SYSTEM_SETTINGS_SCREEN: true,
  },
} satisfies Record<string, UserFeaturesConfig>;

export const stateFeatureConfigs: Record<StateCode, StateFeaturesConfig> = {
  DEMO: {
    AUDIO_ENABLED: true,
    BALLOT_LANGUAGE_CONFIG: true,
    EXPORT_TEST_BALLOTS: true,
  },

  MS: {
    AUDIO_ENABLED: true,
    EXPORT_TEST_BALLOTS: true,
  },

  NH: {
    EXPORT_SAMPLE_BALLOTS: true,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
    CONTEST_SECTION_HEADERS: true,
  },
};

export function getUserFeaturesConfig(user: User): UserFeaturesConfig {
  if (userBelongsToOrganization(user, votingWorksOrganizationId())) {
    return userFeatureConfigs.vx;
  }
  if (userBelongsToOrganization(user, sliOrganizationId())) {
    return userFeatureConfigs.sli;
  }
  return {};
}

export function getStateFeaturesConfig(
  jurisdiction: Jurisdiction
): StateFeaturesConfig {
  return stateFeatureConfigs[jurisdiction.stateCode];
}

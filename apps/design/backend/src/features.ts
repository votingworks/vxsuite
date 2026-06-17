import { sliOrganizationId, votingWorksOrganizationId } from './globals';
import { Jurisdiction, StateCode, User } from './types';
import { userBelongsToOrganization } from './utils';

/**
 * Features that should be enabled based on the user's organization - i.e.
 * differentiating between what VX support users can do and what election
 * officials can do.
 */
export interface UserFeaturesConfig {
  //
  // Export screen features
  //

  /**
   * Show the export screen.
   */
  EXPORT_SCREEN?: boolean;
  /**
   * Allow the user to choose a ballot template.
   * Requires the export screen to be enabled.
   */
  CHOOSE_BALLOT_TEMPLATE?: boolean;
  /**
   * Allow the user to export test decks.
   * Requires the export screen to be enabled.
   */
  EXPORT_TEST_DECKS?: boolean;

  //
  // System settings screen features
  //

  /**
   * Show the system settings screen.
   */
  SYSTEM_SETTINGS_SCREEN?: boolean;
  /**
   * Allow the user to toggle VxScan's ability to scan BMD ballots.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle VxScan's alarms.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_ALARMS_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle the ability to print a write-in image report on VxScan.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_WRITE_IN_IMAGE_REPORT_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle screen reader audio on VxScan.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_SCREEN_READER_AUDIO_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to configure the number of copies of each polls report that
   * VxScan prints.
   * Requires the system settings screen to be enabled.
   */
  VXSCAN_NUMBER_OF_REPORT_COPIES_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle the ability to mark overvotes on VxMark.
   * Requires the system settings screen to be enabled.
   */
  BMD_OVERVOTE_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to select BMD print modes beyond summary ballots.
   * Requires the system settings screen to be enabled.
   */
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to configure quick results reporting.
   * Requires the system settings screen to be enabled.
   */
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle system limit checks on election package import.
   * Requires the system settings screen to be enabled.
   */
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle voter help buttons.
   * Requires the system settings screen to be enabled.
   */
  VOTER_HELP_BUTTONS_SYSTEM_SETTING?: boolean;
}

/**
 * Features that should be enabled based on the state of the election
 * currently being viewed. VX support users and election officials should all
 * have the same functionality for these features when viewing a specific
 * election.
 */
export interface StateFeaturesConfig {
  /**
   * Only allow selecting letter and legal paper sizes for ballots.
   */
  ONLY_LETTER_AND_LEGAL_PAPER_SIZES?: boolean;
  /**
   * Allow the user to select ballot languages.
   */
  BALLOT_LANGUAGE_CONFIG?: boolean;
  /**
   * Enable audio exports and audio-proofing UI.
   */
  AUDIO_ENABLED?: boolean;
  /**
   * Add a field to override the election title for a precinct split.
   */
  PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE?: boolean;
  /**
   * Add a field to override the election seal for a precinct split.
   */
  PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE?: boolean;
  /**
   * Add a field to upload a clerk signature image for a precinct split.
   */
  PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE?: boolean;
  /**
   * Add a field to enter a caption for the clerk signature image for a precinct split.
   */
  PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE?: boolean;
  /**
   * Include sample ballots in exports.
   */
  EXPORT_SAMPLE_BALLOTS?: boolean;
  /**
   * Include test mode ballots in exports.
   */
  EXPORT_TEST_BALLOTS?: boolean;
  /**
   * Enable adding more than two options for ballot measures. (Ballot measure
   * contests with additional options will be transformed into candidate
   * contests for export until VxSuite supports them.)
   */
  ADDITIONAL_BALLOT_MEASURE_OPTIONS?: boolean;
  /**
   * Show a warning when finalizing a ballot that requesting a change after finalizing may incur a
   * fee.
   */
  POST_FINALIZE_CHANGE_FEE_WARNING?: boolean;
  /**
   * Enables:
   * - A screen for viewing/editing polling places.
   * - Automatic polling place creation (from precincts) when importing
   *   elections with no existing polling places.
   * - Automatic polling place creation for newly created precincts.
   *
   * This functionality is feature-flagged, since the concept of Polling Places
   * is not relevant to some customers (e.g. for those where precincts have a
   * 1:1 mapping to polling place) and may be confusing.
   *
   * Note: When this flag is off, polling places will still be generated from
   * precincts at the time of export.
   */
  EDIT_POLLING_PLACES?: boolean;
  /**
   * Hides the registered voter count fields in the precinct form.
   */
  DISABLE_REGISTERED_VOTERS_COUNTS?: boolean;
  /**
   * Allows an election to have no absentee polling places. Enabled for states
   * where central scanning is only ever an emergency fallback (NH).
   *
   * When this is unset (default), every election is expected to have absentee
   * polling places covering all precincts: if the jurisdiction has created its
   * own, they are validated to cover all precincts at finalization; otherwise a
   * default "Central Scanning" place covering all precincts is created on
   * export.
   */
  OMIT_ABSENTEE_POLLING_PLACES?: boolean;
  /**
   * Allow creating open primary elections, where all parties' contests are on
   * the same ballot rather than having a separate ballot for each party.
   */
  OPEN_PRIMARIES?: boolean;
  /**
   * Allow deleting live reports data. Only enabled for demo jurisdictions so
   * that demo data can be cleared between runs; live/production data should
   * never be deletable from the UI.
   */
  DELETE_LIVE_REPORTS?: boolean;
  /**
   * Enable straight party voting. In a general election, adds a straight party
   * ticket contest at the beginning of the ballot, which allows a voter to
   * automatically vote for that party's candidates in all contests without
   * explicitly selecting them.
   */
  STRAIGHT_PARTY_VOTING?: boolean;
}

export type UserFeature = keyof UserFeaturesConfig;
export type StateFeature = keyof StateFeaturesConfig;

const vxUserFeaturesConfig: UserFeaturesConfig = {
  EXPORT_SCREEN: true,
  CHOOSE_BALLOT_TEMPLATE: true,
  EXPORT_TEST_DECKS: true,

  SYSTEM_SETTINGS_SCREEN: true,
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING: true,
  BMD_OVERVOTE_SYSTEM_SETTING: true,
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING: true,
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING: true,
  VOTER_HELP_BUTTONS_SYSTEM_SETTING: true,
  VXSCAN_ALARMS_SYSTEM_SETTING: true,
  VXSCAN_BMD_BALLOT_SCANNING_SYSTEM_SETTING: true,
  VXSCAN_NUMBER_OF_REPORT_COPIES_SYSTEM_SETTING: true,
  VXSCAN_SCREEN_READER_AUDIO_SYSTEM_SETTING: true,
  VXSCAN_WRITE_IN_IMAGE_REPORT_SYSTEM_SETTING: true,
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
    DELETE_LIVE_REPORTS: true,
    EDIT_POLLING_PLACES: true,
    EXPORT_TEST_BALLOTS: true,
  },

  MI: {
    AUDIO_ENABLED: true,
    EDIT_POLLING_PLACES: true,
    EXPORT_SAMPLE_BALLOTS: true,
    EXPORT_TEST_BALLOTS: true,
    OPEN_PRIMARIES: true,
    STRAIGHT_PARTY_VOTING: true,
  },

  MS: {
    AUDIO_ENABLED: true,
    EXPORT_SAMPLE_BALLOTS: true,
    EXPORT_TEST_BALLOTS: true,
  },

  NH: {
    ADDITIONAL_BALLOT_MEASURE_OPTIONS: true,
    EXPORT_SAMPLE_BALLOTS: true,
    OMIT_ABSENTEE_POLLING_PLACES: true,
    ONLY_LETTER_AND_LEGAL_PAPER_SIZES: true,
    POST_FINALIZE_CHANGE_FEE_WARNING: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_CAPTION_OVERRIDE: true,
    PRECINCT_SPLIT_CLERK_SIGNATURE_IMAGE_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_SEAL_OVERRIDE: true,
    PRECINCT_SPLIT_ELECTION_TITLE_OVERRIDE: true,
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
  jurisdiction: Pick<Jurisdiction, 'stateCode'>
): StateFeaturesConfig {
  return stateFeatureConfigs[jurisdiction.stateCode];
}

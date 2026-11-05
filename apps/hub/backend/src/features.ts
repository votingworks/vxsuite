import { sliOrganizationId, votingWorksOrganizationId } from './globals.js';
import type { User } from './types.js';
import { userBelongsToOrganization } from './utils.js';

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
   * Allow the user to toggle exporting transliterated candidate names for
   * non-Latin-script ballot languages.
   * Requires the system settings screen to be enabled.
   */
  TRANSLITERATE_CANDIDATE_NAMES_SYSTEM_SETTING?: boolean;
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
  /**
   * Allow the user to toggle the test deck printing functionality on VxPrint
   * and VxMark.
   * Requires the system settings screen to be enabled.
   */
  TEST_DECK_PRINTING_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle printing blank ballots from VxMark.
   * Requires the system settings screen to be enabled.
   */
  VXMARK_PRINT_BLANK_BALLOTS_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to toggle QR ballot activation on VxMark.
   * Requires the system settings screen to be enabled.
   */
  VXMARK_QR_BALLOT_ACTIVATION_SYSTEM_SETTING?: boolean;
  /**
   * Allow the user to enable the poll worker role for VxCentralScan.
   * Requires the system settings screen to be enabled.
   */
  VXCENTRALSCAN_POLL_WORKER_ROLE_SYSTEM_SETTING?: boolean;
  /**
   * [WIP] Allow toggling the split election definition system setting.
   */
  SPLIT_ELECTION_DEFINITION_SYSTEM_SETTING?: boolean;
}

export type UserFeature = keyof UserFeaturesConfig;

const vxUserFeaturesConfig: UserFeaturesConfig = {
  EXPORT_SCREEN: true,
  CHOOSE_BALLOT_TEMPLATE: true,
  EXPORT_TEST_DECKS: true,

  SYSTEM_SETTINGS_SCREEN: true,
  BMD_EXTRA_PRINT_MODES_SYSTEM_SETTING: true,
  BMD_OVERVOTE_SYSTEM_SETTING: true,
  QUICK_RESULTS_REPORTING_SYSTEM_SETTING: true,
  SPLIT_ELECTION_DEFINITION_SYSTEM_SETTING: true,
  SYSTEM_LIMIT_CHECKS_SYSTEM_SETTING: true,
  TEST_DECK_PRINTING_SYSTEM_SETTING: true,
  TRANSLITERATE_CANDIDATE_NAMES_SYSTEM_SETTING: true,
  VOTER_HELP_BUTTONS_SYSTEM_SETTING: true,
  VXCENTRALSCAN_POLL_WORKER_ROLE_SYSTEM_SETTING: true,
  VXMARK_PRINT_BLANK_BALLOTS_SYSTEM_SETTING: true,
  VXMARK_QR_BALLOT_ACTIVATION_SYSTEM_SETTING: true,
  VXSCAN_ALARMS_SYSTEM_SETTING: true,
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

export function getUserFeaturesConfig(user: User): UserFeaturesConfig {
  if (userBelongsToOrganization(user, votingWorksOrganizationId())) {
    return userFeatureConfigs.vx;
  }
  if (userBelongsToOrganization(user, sliOrganizationId())) {
    return userFeatureConfigs.sli;
  }
  return {};
}

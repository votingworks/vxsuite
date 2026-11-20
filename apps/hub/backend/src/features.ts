import { sliOrganizationId, votingWorksOrganizationId } from './globals.js';
import type { User } from './types.js';
import { userBelongsToOrganization } from './utils.js';

/**
 * Features that should be enabled based on the user's organization,
 * differentiating what VotingWorks support users, test labs, and customers can
 * do.
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
   * Show system settings that are not documented in the current TDP. Some of
   * these are new and will eventually be documented. Others are meant for
   * internal use and should not be toggled by test labs.
   * Requires the system settings screen to be enabled.
   */
  UNDOCUMENTED_SYSTEM_SETTINGS?: boolean;
}

export type UserFeature = keyof UserFeaturesConfig;

export const userFeatureConfigs = {
  vx: {
    EXPORT_SCREEN: true,
    CHOOSE_BALLOT_TEMPLATE: true,
    EXPORT_TEST_DECKS: true,

    SYSTEM_SETTINGS_SCREEN: true,
    UNDOCUMENTED_SYSTEM_SETTINGS: true,
  },
  sli: {
    EXPORT_SCREEN: true,
    SYSTEM_SETTINGS_SCREEN: true,
  },
  customers: {},
} satisfies Record<string, UserFeaturesConfig>;

export function getUserFeaturesConfig(user: User): UserFeaturesConfig {
  if (userBelongsToOrganization(user, votingWorksOrganizationId())) {
    return userFeatureConfigs.vx;
  }
  if (userBelongsToOrganization(user, sliOrganizationId())) {
    return userFeatureConfigs.sli;
  }
  return userFeatureConfigs.customers;
}

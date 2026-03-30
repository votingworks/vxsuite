import {
  AdjudicationReason,
  DEFAULT_MARK_THRESHOLDS,
  DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,
  DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';

import { sliOrganizationId } from './globals';
import { Jurisdiction, resultsReportingUrl, StateCode } from './types';

/**
 * Default settings applied across customers and SLI
 */
const commonSettings = {
  auth: DEFAULT_SYSTEM_SETTINGS.auth,
  maxCumulativeStreakWidth: DEFAULT_MAX_CUMULATIVE_STREAK_WIDTH,
  retryStreakWidthThreshold: DEFAULT_RETRY_STREAK_WIDTH_THRESHOLD,
} as const;

/**
 * Default settings applied across customers but not SLI
 */
const commonCustomerSettings = {
  precinctScanEnableBmdBallotScanning: true,
  precinctScanDisableAlarms: true,
  precinctScanDisableScreenReaderAudio: true,
  disableSystemLimitChecks: true,
  disableVoterHelpButtons: true,
} as const;

export const stateDefaultSystemSettings: Record<StateCode, SystemSettings> = {
  DEMO: {
    ...commonSettings,
    ...commonCustomerSettings,

    markThresholds: DEFAULT_MARK_THRESHOLDS_MARGINAL_MARK_ADJUDICATION_ENABLED,

    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.BlankBallot,
      AdjudicationReason.UnmarkedWriteIn,
    ],
    disallowCastingOvervotes: false,
    centralScanAdjudicationReasons: [AdjudicationReason.UnmarkedWriteIn],
    adminAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.MarginalMark,
    ],

    bmdPrintMode: 'bubble_ballot',
    quickResultsReportingUrl: resultsReportingUrl(),
  },

  MS: {
    ...commonSettings,
    ...commonCustomerSettings,

    markThresholds: DEFAULT_MARK_THRESHOLDS,

    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.Undervote,
      AdjudicationReason.BlankBallot,
    ],
    disallowCastingOvervotes: false,
    centralScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.BlankBallot,
    ],
    adminAdjudicationReasons: [],

    bmdPrintMode: 'summary',
    quickResultsReportingUrl: resultsReportingUrl(),
  },

  NH: {
    ...commonSettings,
    ...commonCustomerSettings,

    markThresholds: DEFAULT_MARK_THRESHOLDS,

    precinctScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.UnmarkedWriteIn,
    ],
    disallowCastingOvervotes: true,
    centralScanAdjudicationReasons: [
      AdjudicationReason.Overvote,
      AdjudicationReason.UnmarkedWriteIn,
    ],
    adminAdjudicationReasons: [],

    allowOfficialBallotsInTestMode: true,
    bmdPrintMode: 'bubble_ballot',
  },
};

export const SLI_DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ...commonSettings,

  markThresholds: DEFAULT_MARK_THRESHOLDS,

  precinctScanAdjudicationReasons: [],
  disallowCastingOvervotes: false,
  centralScanAdjudicationReasons: [],
  adminAdjudicationReasons: [],

  bmdPrintMode: 'bubble_ballot',
};

export function defaultSystemSettings(
  jurisdiction: Jurisdiction
): SystemSettings {
  if (jurisdiction.organization.id === sliOrganizationId()) {
    return SLI_DEFAULT_SYSTEM_SETTINGS;
  }
  return stateDefaultSystemSettings[jurisdiction.stateCode];
}

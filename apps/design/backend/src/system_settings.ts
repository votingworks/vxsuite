import {
  AdjudicationReason,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
} from '@votingworks/types';
import { Jurisdiction, resultsReportingUrl, StateCode } from './types';
import { sliOrganizationId } from './globals';

export const stateDefaultSystemSettings: Record<StateCode, SystemSettings> = {
  DEMO: {
    auth: DEFAULT_SYSTEM_SETTINGS.auth,
    markThresholds: {
      definite: 0.1,
      marginal: 0.05,
      writeInTextArea: 0.05,
    },
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
    precinctScanEnableBmdBallotScanning: true,
    bmdPrintMode: 'bubble_ballot',
    precinctScanDisableAlarms: true,
    quickResultsReportingUrl: resultsReportingUrl(),
    disableSystemLimitChecks: true,
    disableVoterHelpButtons: true,
  },

  MS: {
    auth: DEFAULT_SYSTEM_SETTINGS.auth,
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
    markThresholds: {
      definite: 0.07,
      marginal: 0.05,
      writeInTextArea: 0.05,
    },
    precinctScanEnableBmdBallotScanning: true,
    bmdPrintMode: 'summary',
    precinctScanDisableAlarms: true,
    quickResultsReportingUrl: resultsReportingUrl(),
    disableSystemLimitChecks: true,
    disableVoterHelpButtons: true,
  },

  NH: {
    auth: DEFAULT_SYSTEM_SETTINGS.auth,
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
    markThresholds: {
      definite: 0.07,
      marginal: 0.05,
      writeInTextArea: 0.05,
    },
    allowOfficialBallotsInTestMode: true,
    precinctScanEnableBmdBallotScanning: true,
    bmdPrintMode: 'bubble_ballot',
    precinctScanDisableAlarms: true,
    disableSystemLimitChecks: true,
    disableVoterHelpButtons: true,
  },
};

export const SLI_DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  auth: DEFAULT_SYSTEM_SETTINGS.auth,
  precinctScanAdjudicationReasons: [],
  disallowCastingOvervotes: false,
  centralScanAdjudicationReasons: [],
  adminAdjudicationReasons: [],
  markThresholds: {
    definite: 0.07,
    marginal: 0.05,
    writeInTextArea: 0.05,
  },
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

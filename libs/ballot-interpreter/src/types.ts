import {
  AdjudicationReason,
  ElectionDefinition,
  MarkThresholds,
} from '@votingworks/types';

/**
 * Options for interpreting a sheet of ballot images.
 */
export interface InterpreterOptions {
  adjudicationReasons: readonly AdjudicationReason[];
  electionDefinition: ElectionDefinition;
  allowOfficialBallotsInTestMode?: boolean;
  disableVerticalStreakDetection?: boolean;
  markThresholds: MarkThresholds;
  validPrecinctIds: Set<string>;
  testMode: boolean;
  disableBmdBallotScanning?: boolean;
  minimumDetectedScale?: number;
  maxCumulativeStreakWidth?: number;
  retryStreakWidthThreshold?: number;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
}

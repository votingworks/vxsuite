import {
  AdjudicationReason,
  ElectionDefinition,
  MarkThresholds,
  PrecinctSelection,
} from '@votingworks/types';

/**
 * Options for interpreting a sheet of ballot images.
 */
export interface InterpreterOptions {
  adjudicationReasons: readonly AdjudicationReason[];
  electionDefinition: ElectionDefinition;
  allowOfficialBallotsInTestMode?: boolean;
  disableVerticalStreakDetection?: boolean;
  inferTimingMarks?: boolean;
  markThresholds: MarkThresholds;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
  disableBmdBallotScanning?: boolean;
  minimumDetectedScale?: number;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
}

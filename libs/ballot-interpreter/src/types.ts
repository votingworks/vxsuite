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
  markThresholds: MarkThresholds;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
}

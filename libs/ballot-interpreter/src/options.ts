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
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  testMode: boolean;
  markThresholds: MarkThresholds;
  adjudicationReasons: readonly AdjudicationReason[];
}

export function getScoreWriteInsFlag(options: InterpreterOptions): boolean {
  return options.adjudicationReasons.includes(
    AdjudicationReason.UnmarkedWriteIn
  );
}

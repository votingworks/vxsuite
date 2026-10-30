import type {
  AdjudicationReason,
  BallotImageBitDepth,
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
  minimumDetectedScale?: number;
  maxCumulativeStreakWidth?: number;
  retryStreakWidthThreshold?: number;
  ballotImageBitDepth?: BallotImageBitDepth;
  frontNormalizedImageOutputPath?: string;
  backNormalizedImageOutputPath?: string;
  /**
   * Path to a SQLite database with a `ballot_positions` table (see
   * `BallotMetaStore`). Bubble ballot interpretation is skipped when omitted.
   */
  ballotPositionsDbPath?: string;
}

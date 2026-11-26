import type {
  AdjudicationReason,
  BallotImageBitDepth,
  ElectionDefinition,
  MarkThresholds,
} from '@votingworks/types';

/** Options shared by every kind of ballot interpretation. */
export interface BaseInterpreterOptions {
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
}

/**
 * Options for interpreting a sheet of ballot images.
 */
export interface InterpreterOptions extends BaseInterpreterOptions {
  /**
   * Path to the election package SQLite database holding the configured
   * election and its ballot positions (see `ElectionPackageStore`).
   */
  dbPath: string;
  /** Whether `dbPath` holds ballot positions, without which bubble ballot interpretation is skipped. */
  hasBallotPositions: boolean;
}

/** Options for interpreting a single-sided summary ballot. */
export interface SimplexBmdInterpreterOptions extends BaseInterpreterOptions {
  /**
   * Path to the election package SQLite database holding the configured
   * election. When omitted, `electionDefinition` is sent to the interpreter
   * instead, which costs a serialization per ballot.
   */
  dbPath?: string;
}

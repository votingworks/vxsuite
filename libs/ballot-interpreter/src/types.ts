import type {
  AdjudicationReason,
  BallotImageBitDepth,
  ElectionDefinition,
  MarkThresholds,
} from '@votingworks/types';

/**
 * Options for interpreting a sheet of ballot images.
 */
export type InterpreterOptions = AutoDetectOptions | SummaryBallotOptions;

export type AutoDetectOptions = CoreOptions & {
  mode: 'auto_detect';
  ballotPositionsDbPath: string;
};

export type SummaryBallotOptions = CoreOptions & {
  mode: 'summary_ballot';
};

interface CoreOptions {
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

import {
  AdjudicationReasonInfo,
  BallotTargetMark,
  ElectionDefinition,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

/**
 * Possible errors that can occur during configuration (currently there's only one).
 */
export type ConfigurationError = 'no_ballot_package_on_usb_drive';

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T;
  contestIds?: readonly string[];
}

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}

export function getMarkStatus(
  mark: BallotTargetMark,
  markThresholds: MarkThresholds
): MarkStatus {
  if (mark.score >= markThresholds.definite) {
    return MarkStatus.Marked;
  }

  if (mark.score >= markThresholds.marginal) {
    return MarkStatus.Marginal;
  }

  return MarkStatus.Unmarked;
}

export type PrecinctScannerState =
  | 'connecting'
  | 'disconnected'
  | 'no_paper'
  | 'ready_to_scan'
  | 'scanning'
  | 'ready_to_accept'
  | 'accepting'
  | 'accepted'
  | 'needs_review'
  | 'accepting_after_review'
  | 'returning'
  | 'returned'
  | 'rejecting'
  | 'rejected'
  | 'calibrating'
  | 'jammed'
  | 'both_sides_have_paper'
  | 'recovering_from_error'
  | 'unrecoverable_error';

export type InvalidInterpretationReason =
  | 'invalid_test_mode'
  | 'invalid_election_hash'
  | 'invalid_precinct'
  | 'unreadable'
  | 'unknown';

export type SheetInterpretation =
  | {
      type: 'ValidSheet';
    }
  | {
      type: 'InvalidSheet';
      reason: InvalidInterpretationReason;
    }
  | {
      type: 'NeedsReviewSheet';
      reasons: AdjudicationReasonInfo[];
    };
export type PrecinctScannerErrorType =
  | 'paper_status_timed_out'
  | 'scanning_timed_out'
  | 'scanning_failed'
  | 'both_sides_have_paper'
  | 'paper_in_back_after_accept'
  | 'paper_in_front_after_reconnect'
  | 'paper_in_back_after_reconnect'
  | 'unexpected_paper_status'
  | 'unexpected_event'
  | 'plustek_error';
export interface PrecinctScannerMachineStatus {
  state: PrecinctScannerState;
  interpretation?: SheetInterpretation;
  error?: PrecinctScannerErrorType;
}

export interface PrecinctScannerStatus extends PrecinctScannerMachineStatus {
  ballotsCounted: number;
  canUnconfigure: boolean;
}

export interface PrecinctScannerConfig {
  // Config that persists across switching modes
  electionDefinition?: ElectionDefinition;
  precinctSelection?: PrecinctSelection;
  markThresholdOverrides?: MarkThresholds;
  isSoundMuted: boolean;
  // "Config" that is specific to each election session
  isTestMode: boolean;
  pollsState: PollsState;
  ballotCountWhenBallotBagLastReplaced: number;
}

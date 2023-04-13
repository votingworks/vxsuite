import { Result } from '@votingworks/basics';
import {
  AdjudicationReasonInfo,
  ElectionDefinition,
  MarkThresholds,
  PageInterpretation,
  PollsState,
  PrecinctSelection,
  SystemSettings,
} from '@votingworks/types';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

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

export type PrecinctScannerState =
  | 'connecting'
  | 'disconnected'
  | 'no_paper'
  | 'ready_to_scan'
  | 'scanning'
  | 'returning_to_rescan'
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
  | 'double_sheet_jammed'
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
  | 'paper_in_both_sides_after_reconnect'
  | 'unexpected_paper_status'
  | 'unexpected_event'
  | 'calibration_failed'
  | 'client_error';
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
  systemSettings?: SystemSettings;
  precinctSelection?: PrecinctSelection;
  markThresholdOverrides?: MarkThresholds;
  isSoundMuted: boolean;
  isUltrasonicDisabled: boolean;
  // "Config" that is specific to each election session
  isTestMode: boolean;
  pollsState: PollsState;
  ballotCountWhenBallotBagLastReplaced: number;
}

/**
 * The precinct scanner state machine can:
 * - return its status
 * - accept scanning commands
 * - calibrate
 */
export interface PrecinctScannerStateMachine {
  status: () => PrecinctScannerMachineStatus;
  supportsUltrasonic: () => boolean;
  // The commands are non-blocking and do not return a result. They just send an
  // event to the machine. The effects of the event (or any error) will show up
  // in the status.
  scan: () => void;
  accept: () => void;
  return: () => void;
  // Calibrate is the exception, which blocks until calibration is finished and
  // returns a result.
  calibrate?: () => Promise<Result<void, string>>;
}

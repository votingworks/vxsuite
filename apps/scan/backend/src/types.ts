import {
  ElectionDefinition,
  PageInterpretation,
  PollsState,
  PollsTransitionType,
  PrecinctSelection,
  SheetInterpretation,
  SystemSettings,
} from '@votingworks/types';
import { PrecinctScannerState } from '@votingworks/types/src/precinct_scanner';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation,
> {
  interpretation: T;
  contestIds?: readonly string[];
}

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
  | 'client_error';
export interface PrecinctScannerMachineStatus {
  state: PrecinctScannerState;
  interpretation?: SheetInterpretation;
  error?: PrecinctScannerErrorType;
}

export interface PrecinctScannerStatus extends PrecinctScannerMachineStatus {
  ballotsCounted: number;
}

export interface PrecinctScannerConfig {
  // Config that persists across switching modes
  electionDefinition?: ElectionDefinition;
  systemSettings: SystemSettings;
  precinctSelection?: PrecinctSelection;
  isSoundMuted: boolean;
  isUltrasonicDisabled: boolean;
  hasPaperBeenLoaded: boolean;
  // "Config" that is specific to each election session
  isTestMode: boolean;
  ballotCountWhenBallotBagLastReplaced: number;
}

/**
 * The precinct scanner state machine can:
 * - return its status
 * - accept scanning commands
 */
export interface PrecinctScannerStateMachine {
  status: () => PrecinctScannerMachineStatus;
  // The commands are non-blocking and do not return a result. They just send an
  // event to the machine. The effects of the event (or any error) will show up
  // in the status.
  accept: () => void;
  return: () => void;

  // Stop the state machine and release any resources it is using.
  stop: () => void;
}

export interface PollsTransition {
  type: PollsTransitionType;
  time: number;
  ballotCount: number;
}

export type PrecinctScannerPollsInfo =
  | {
      pollsState: Extract<PollsState, 'polls_closed_initial'>;
    }
  | {
      pollsState: Exclude<PollsState, 'polls_closed_initial'>;
      lastPollsTransition: PollsTransition;
    };

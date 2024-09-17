import {
  ElectionDefinition,
  Id,
  PageInterpretation,
  PollsState,
  PollsTransitionType,
  PrecinctSelection,
  SheetInterpretationWithPages,
  SystemSettings,
  PrecinctScannerMachineStatus,
} from '@votingworks/types';

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

export type InterpretationResult = SheetInterpretationWithPages & {
  sheetId: Id;
};

export interface PrecinctScannerStatus extends PrecinctScannerMachineStatus {
  ballotsCounted: number;
}

export interface PrecinctScannerConfig {
  // Config that persists across switching modes
  electionDefinition?: ElectionDefinition;
  electionPackageHash?: string;
  systemSettings: SystemSettings;
  precinctSelection?: PrecinctSelection;
  isSoundMuted: boolean;
  isDoubleFeedDetectionDisabled: boolean;
  // "Config" that is specific to each election session
  isTestMode: boolean;
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

  beginDoubleFeedCalibration: () => void;
  endDoubleFeedCalibration: () => void;

  beginScannerDiagnostic: () => void;
  endScannerDiagnostic: () => void;

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

import { EncodedBallotEntry, Id } from '@votingworks/types';

export interface BallotPrintEntry extends EncodedBallotEntry {
  ballotPrintId: Id;
}

/**
 * Environment variables that identify the machine and its software. Set at the
 * machine-level rather than the at the software-level.
 */
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export interface BallotPrintCount {
  ballotStyleId: Id;
  precinctId: Id;
  absentee: number;
  precinct: number;
  total: number;
}

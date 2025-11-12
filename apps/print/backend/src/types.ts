import { EncodedBallotEntry } from '@votingworks/types';

export interface BallotPrintEntry extends EncodedBallotEntry {
  ballotPrintId: string;
}

/**
 * Environment variables that identify the machine and its software. Set at the
 * machine-level rather than the at the software-level.
 */
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

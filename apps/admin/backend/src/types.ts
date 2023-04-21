import { Result } from '@votingworks/basics';
import { CVR, Dictionary, Id } from '@votingworks/types';

/**
 * Environment variables that identify the machine and its software. Set at the
 * machine-level rather than the at the software-level.
 */
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

/**
 * Result of attempt to configure the app with a new election definition
 */
export type ConfigureResult = Result<
  { electionId: Id },
  { type: 'parsing'; message: string }
>;

/**
 * Result of attempt to store and apply system settings
 */
export type SetSystemSettingsResult = Result<
  Record<string, never>,
  {
    type: 'parsing' | 'database';
    message: string;
  }
>;

/**
 * Metadata about a cast vote record file found on a USB drive.
 */
export interface CastVoteRecordFileMetadata {
  readonly name: string;
  readonly path: string;
  readonly cvrCount: number;
  readonly scannerIds: readonly string[];
  readonly exportTimestamp: Date;
  readonly isTestModeResults: boolean;
}

/**
 * Representation of votes in the VxAdmin store. Simple dictionary of
 * contest id's to a list of contest option ids.
 */
export type CastVoteRecordVotes = Dictionary<readonly string[]>;

/**
 * Representation of a cast vote record's metadata. Does not include ballot ID.
 */
export interface CastVoteRecordMetadata {
  precinctId: string;
  ballotStyleId: string;
  scannerId: string;
  partyId?: string;
  ballotType: CVR.vxBallotType;
  batchId: string;
  batchLabel: string;
  sheetNumber: number;
}

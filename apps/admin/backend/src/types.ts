import { Admin } from '@votingworks/api';
import { Result } from '@votingworks/basics';
import { Id } from '@votingworks/types';
import { AddCastVoteRecordError } from './store';

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
 * Errors that may occur when loading a cast vote record file from a path
 */
export type AddCastVoteRecordFileError =
  | { type: 'invalid-file'; userFriendlyMessage: string }
  | ({ type: 'invalid-record' } & AddCastVoteRecordError)
  | { type: 'invalid-cdf-report'; userFriendlyMessage: string };

/**
 * Result of attempt to load a cast vote record file from a path
 */
export type AddCastVoteRecordFileResult = Result<
  Admin.CvrFileImportInfo,
  AddCastVoteRecordFileError
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

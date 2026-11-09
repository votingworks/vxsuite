import type { Result } from '@votingworks/basics';
import type { ElectionId } from '@votingworks/types';
import type { DuplicateElectionError } from './error_types.js';
import type { StateFeaturesConfig } from './state_features.js';
import type { ElectionInfo, ElectionInfoUpdate } from './types.js';

type MaybePromise<T> = T | Promise<T>;

export interface ElectionInput {
  electionId: ElectionId;
}

/** API methods needed for election definition CRUD and shared UI. */
export interface ElectionDefinitionMethods {
  getElectionInfo(input: ElectionInput): MaybePromise<ElectionInfo>;
  updateElectionInfo(
    input: ElectionInfoUpdate
  ): MaybePromise<Result<void, DuplicateElectionError>>;
  getStateFeatures(input: ElectionInput): MaybePromise<StateFeaturesConfig>;
  deleteElection(input: ElectionInput): MaybePromise<void>;
}

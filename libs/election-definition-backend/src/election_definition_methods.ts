import type { Result } from '@votingworks/basics';
import type { District, ElectionId } from '@votingworks/types';
import type {
  DuplicateDistrictError,
  DuplicateElectionError,
} from './error_types.js';
import type { StateFeaturesConfig } from './state_features.js';
import type {
  DistrictsUpdate,
  ElectionInfo,
  ElectionInfoUpdate,
} from './types.js';

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
  listDistricts(input: ElectionInput): MaybePromise<readonly District[]>;
  updateDistricts(
    input: DistrictsUpdate
  ): MaybePromise<Result<void, DuplicateDistrictError>>;
}

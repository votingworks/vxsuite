import type { Result } from '@votingworks/basics';
import type {
  Contest,
  District,
  ElectionId,
  ElectionRegisteredVoterCounts,
  Party,
  PollingPlace,
  Precinct,
} from '@votingworks/types';
import type {
  DuplicateContestError,
  DuplicateDistrictError,
  DuplicateElectionError,
  DuplicatePartyError,
  DuplicatePrecinctError,
  SetPollingPlaceError,
} from './error_types.js';
import type { StateFeaturesConfig } from './state_features.js';
import type {
  ContestCreate,
  ContestDelete,
  ContestsReorder,
  ContestUpdate,
  DistrictsUpdate,
  ElectionInfo,
  ElectionInfoUpdate,
  PartiesUpdate,
  PollingPlaceDelete,
  PollingPlaceSet,
  PrecinctCreate,
  PrecinctDelete,
  PrecinctUpdate,
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
  listParties(input: ElectionInput): MaybePromise<readonly Party[]>;
  updateParties(
    input: PartiesUpdate
  ): MaybePromise<Result<void, DuplicatePartyError>>;
  listContests(input: ElectionInput): MaybePromise<readonly Contest[]>;
  createContest(
    input: ContestCreate
  ): MaybePromise<Result<void, DuplicateContestError>>;
  updateContest(
    input: ContestUpdate
  ): MaybePromise<Result<void, DuplicateContestError>>;
  reorderContests(input: ContestsReorder): MaybePromise<void>;
  deleteContest(input: ContestDelete): MaybePromise<void>;
  listPrecincts(input: ElectionInput): MaybePromise<readonly Precinct[]>;
  createPrecinct(
    input: PrecinctCreate
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  updatePrecinct(
    input: PrecinctUpdate
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  deletePrecinct(input: PrecinctDelete): MaybePromise<void>;
  getRegisteredVoterCounts(
    input: ElectionInput
  ): MaybePromise<ElectionRegisteredVoterCounts>;
  listPollingPlaces(
    input: ElectionInput
  ): MaybePromise<readonly PollingPlace[]>;
  setPollingPlace(
    input: PollingPlaceSet
  ): MaybePromise<Result<void, SetPollingPlaceError>>;
  deletePollingPlace(input: PollingPlaceDelete): MaybePromise<void>;
}

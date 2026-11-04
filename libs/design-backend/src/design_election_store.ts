import type { Result } from '@votingworks/basics';
import type { BallotTemplateId } from '@votingworks/hmpb';
import type {
  BallotStyle,
  Contest,
  District,
  Election,
  ElectionId,
  ElectionRegisteredVoterCounts,
  HmpbBallotPaperSize,
  Party,
  PollingPlace,
  Precinct,
  PrecinctId,
  PrecinctRegisteredVoterCountEntry,
  SystemSettings,
} from '@votingworks/types';
import type {
  DuplicateContestError,
  DuplicateDistrictError,
  DuplicateElectionError,
  DuplicatePartyError,
  DuplicatePrecinctError,
  ElectionRecord,
  SetPollingPlaceError,
} from './election_record.js';
import type { StateFeaturesConfig } from './features.js';
import type { ElectionInfoUpdate, ExternalElectionSource } from './types.js';

export type MaybePromise<T> = T | Promise<T>;

export interface CreateElectionParams {
  jurisdictionId: string;
  stateFeatures: StateFeaturesConfig;
  election: Election;
  isMiCombinedBallotPrimary: boolean;
  ballotTemplateId: BallotTemplateId;
  systemSettings: SystemSettings;
  externalSource?: ExternalElectionSource;
}

export interface DesignElectionStore {
  createElection(params: CreateElectionParams): MaybePromise<void>;
  getElection(electionId: ElectionId): MaybePromise<ElectionRecord>;
  updateElectionInfo(
    update: ElectionInfoUpdate
  ): MaybePromise<Result<void, DuplicateElectionError>>;

  getBallotLayoutSettings(
    electionId: ElectionId
  ): MaybePromise<{ paperSize: HmpbBallotPaperSize; compact: boolean }>;
  getBallotTemplate(electionId: ElectionId): MaybePromise<BallotTemplateId>;

  listDistricts(electionId: ElectionId): MaybePromise<readonly District[]>;
  updateDistricts(input: {
    electionId: ElectionId;
    deletedDistrictIds?: string[];
    newDistricts?: District[];
    updatedDistricts?: District[];
  }): MaybePromise<Result<void, DuplicateDistrictError>>;

  listPrecincts(electionId: ElectionId): MaybePromise<readonly Precinct[]>;
  createPrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  updatePrecinct(
    electionId: ElectionId,
    precinct: Precinct
  ): MaybePromise<Result<void, DuplicatePrecinctError>>;
  deletePrecinct(
    electionId: ElectionId,
    precinctId: PrecinctId
  ): MaybePromise<void>;
  setPrecinctRegisteredVoterCounts(
    precinct: Precinct,
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry
  ): MaybePromise<void>;
  getRegisteredVoterCounts(
    electionId: ElectionId
  ): MaybePromise<ElectionRegisteredVoterCounts>;
  listBallotStyles(
    electionId: ElectionId
  ): MaybePromise<readonly BallotStyle[]>;

  listParties(electionId: ElectionId): MaybePromise<readonly Party[]>;
  updateParties(input: {
    electionId: ElectionId;
    deletedPartyIds?: string[];
    newParties?: Party[];
    updatedParties?: Party[];
  }): MaybePromise<Result<void, DuplicatePartyError>>;

  listContests(electionId: ElectionId): MaybePromise<readonly Contest[]>;
  createContest(
    electionId: ElectionId,
    contest: Contest
  ): MaybePromise<Result<void, DuplicateContestError>>;
  updateContest(
    electionId: ElectionId,
    contest: Contest
  ): MaybePromise<Result<void, DuplicateContestError>>;
  reorderContests(
    electionId: ElectionId,
    contestIds: string[]
  ): MaybePromise<void>;
  deleteContest(electionId: ElectionId, contestId: string): MaybePromise<void>;

  listPollingPlaces(electionId: ElectionId): MaybePromise<PollingPlace[]>;
  setPollingPlace(
    electionId: ElectionId,
    place: PollingPlace
  ): MaybePromise<Result<void, SetPollingPlaceError>>;
  deletePollingPlace(p: { electionId: string; id: string }): MaybePromise<void>;
}

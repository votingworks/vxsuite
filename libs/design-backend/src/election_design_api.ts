import type { Result } from '@votingworks/basics';
import type * as grout from '@votingworks/grout';
import type { BallotTemplateId } from '@votingworks/hmpb';
import type {
  BallotStyle,
  Contest,
  District,
  ElectionId,
  ElectionRegisteredVoterCounts,
  HmpbBallotPaperSize,
  Party,
  PollingPlace,
  Precinct,
  PrecinctId,
  PrecinctRegisteredVoterCountEntry,
  TtsEdit,
  TtsEditKey,
} from '@votingworks/types';
import type {
  BallotPreviewInput,
  BallotPreviewResult,
} from './ballot_preview.js';
import type {
  DuplicateContestError,
  DuplicateDistrictError,
  DuplicateElectionError,
  DuplicatePartyError,
  DuplicatePrecinctError,
  SetPollingPlaceError,
} from './election_record.js';
import type { StateFeaturesConfig } from './features.js';
import type { DataUrl, TtsStringDefault } from './tts_strings.js';
import type { ElectionInfo, ElectionInfoUpdate } from './types.js';

type MaybePromise<T> = T | Promise<T>;

export interface ElectionInput {
  electionId: ElectionId;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ElectionDesignMethods = {
  getElectionInfo(input: ElectionInput): MaybePromise<ElectionInfo>;
  updateElectionInfo(
    input: ElectionInfoUpdate
  ): MaybePromise<Result<void, DuplicateElectionError>>;
  deleteElection(input: ElectionInput): MaybePromise<void>;

  listDistricts(input: ElectionInput): MaybePromise<readonly District[]>;
  updateDistricts(input: {
    electionId: ElectionId;
    deletedDistrictIds?: string[];
    newDistricts?: District[];
    updatedDistricts?: District[];
  }): MaybePromise<Result<void, DuplicateDistrictError>>;

  listPrecincts(input: ElectionInput): MaybePromise<readonly Precinct[]>;
  createPrecinct(input: {
    electionId: ElectionId;
    newPrecinct: Precinct;
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
  }): MaybePromise<Result<void, DuplicatePrecinctError>>;
  updatePrecinct(input: {
    electionId: ElectionId;
    updatedPrecinct: Precinct;
    registeredVoterCounts?: PrecinctRegisteredVoterCountEntry;
  }): MaybePromise<Result<void, DuplicatePrecinctError>>;
  deletePrecinct(input: {
    electionId: ElectionId;
    precinctId: PrecinctId;
  }): MaybePromise<void>;
  getRegisteredVoterCounts(
    input: ElectionInput
  ): MaybePromise<ElectionRegisteredVoterCounts>;

  listPollingPlaces(input: {
    electionId: string;
  }): MaybePromise<PollingPlace[]>;
  setPollingPlace(input: {
    electionId: ElectionId;
    place: PollingPlace;
  }): MaybePromise<Result<void, SetPollingPlaceError>>;
  deletePollingPlace(input: {
    electionId: string;
    id: string;
  }): MaybePromise<void>;

  listParties(input: ElectionInput): MaybePromise<readonly Party[]>;
  updateParties(input: {
    electionId: ElectionId;
    deletedPartyIds?: string[];
    newParties?: Party[];
    updatedParties?: Party[];
  }): MaybePromise<Result<void, DuplicatePartyError>>;

  listContests(input: ElectionInput): MaybePromise<readonly Contest[]>;
  createContest(input: {
    electionId: ElectionId;
    newContest: Contest;
  }): MaybePromise<Result<void, DuplicateContestError>>;
  updateContest(input: {
    electionId: ElectionId;
    updatedContest: Contest;
  }): MaybePromise<Result<void, DuplicateContestError>>;
  reorderContests(input: {
    electionId: ElectionId;
    contestIds: string[];
  }): MaybePromise<void>;
  deleteContest(input: {
    electionId: ElectionId;
    contestId: string;
  }): MaybePromise<void>;

  listBallotStyles(input: ElectionInput): MaybePromise<readonly BallotStyle[]>;
  getBallotLayoutSettings(
    input: ElectionInput
  ): MaybePromise<{ paperSize: HmpbBallotPaperSize; compact: boolean }>;
  getBallotTemplate(input: ElectionInput): MaybePromise<BallotTemplateId>;
  getBallotsFinalizedAt(input: ElectionInput): MaybePromise<Date | null>;
  getBallotPreviewPdf(
    input: BallotPreviewInput
  ): MaybePromise<BallotPreviewResult>;

  getStateFeatures(input: ElectionInput): MaybePromise<StateFeaturesConfig>;

  ttsEditsGet(input: TtsEditKey): MaybePromise<TtsEdit | null>;
  ttsEditsSet(input: TtsEditKey & { data: TtsEdit }): MaybePromise<void>;
  ttsStringDefaults(input: {
    electionId: string;
  }): MaybePromise<TtsStringDefault[]>;
  ttsSynthesizeFromText(input: {
    text: string;
    languageCode: string;
  }): MaybePromise<DataUrl>;
};

export type ElectionDesignApi = grout.Api<
  ElectionDesignMethods,
  grout.AnyContext
>;

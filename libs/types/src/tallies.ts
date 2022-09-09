import { z } from 'zod';
import { CastVoteRecord } from './cast_vote_record';
import { Contest, Candidate } from './election';
import { Dictionary, Optional } from './generic';

export type YesNoVoteId = 'yes' | 'no';
export type YesNoVoteOption = ['yes'] | ['no'] | [];
export type ContestVoteOption = Candidate | YesNoVoteOption;

export interface YesNoContestOptionTally {
  readonly option: YesNoVoteOption;
  readonly tally: number;
}
export interface ContestOptionTally {
  readonly option: ContestVoteOption;
  readonly tally: number;
}

export interface ContestTally {
  readonly contest: Contest;
  readonly tallies: Dictionary<ContestOptionTally>;
  readonly metadata: ContestTallyMeta;
}

export interface ContestTallyMeta {
  readonly overvotes: number;
  readonly undervotes: number;
  readonly ballots: number;
}
export type ContestTallyMetaDictionary = Dictionary<ContestTallyMeta>;

export interface Tally {
  readonly numberOfBallotsCounted: number;
  readonly castVoteRecords: Set<CastVoteRecord>;
  readonly contestTallies: Dictionary<ContestTally>;
  readonly ballotCountsByVotingMethod: Dictionary<number>;
}

export interface BatchTally extends Tally {
  readonly batchLabel: string;
  readonly scannerIds: string[];
}

export enum TallyCategory {
  Precinct = 'precinct',
  Scanner = 'scanner',
  Party = 'party',
  VotingMethod = 'votingmethod',
  Batch = 'batch',
}

export interface FullElectionTally {
  readonly overallTally: Tally;
  readonly resultsByCategory: ReadonlyMap<TallyCategory, Dictionary<Tally>>;
}

export interface ExternalTally {
  readonly contestTallies: Dictionary<ContestTally>;
  readonly numberOfBallotsCounted: number;
}

export enum ExternalTallySourceType {
  SEMS = 'sems',
  Manual = 'manual-data',
}

export enum VotingMethod {
  Absentee = 'absentee',
  Precinct = 'standard',
  Unknown = 'unknown',
}

export interface FullElectionExternalTally {
  readonly overallTally: ExternalTally;
  readonly resultsByCategory: ReadonlyMap<
    TallyCategory,
    Dictionary<ExternalTally>
  >;
  readonly votingMethod: VotingMethod;
  readonly source: ExternalTallySourceType;
  readonly inputSourceName: string;
  readonly timestampCreated: Date;
}

export type FullElectionExternalTallies = ReadonlyMap<
  ExternalTallySourceType,
  FullElectionExternalTally
>;

export type OptionalExternalTally = Optional<ExternalTally>;
export type OptionalFullElectionTally = Optional<FullElectionTally>;
export type OptionalFullElectionExternalTally =
  Optional<FullElectionExternalTally>;

const nonnegativeInteger = z.number().nonnegative().int();

export type YesNoContestCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  yes: number,
  no: number
];
export const YesNoContestCompressedTallySchema: z.ZodSchema<YesNoContestCompressedTally> =
  z.tuple([
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
  ]);
export type CandidateContestWithWriteInsCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  ...candidates: number[],
  writeIns: number
];
export const CandidateContestWithWriteInsCompressedTallySchema: z.ZodSchema<CandidateContestWithWriteInsCompressedTally> =
  z
    .array(nonnegativeInteger)
    .min(
      4
    ) as unknown as z.ZodSchema<CandidateContestWithWriteInsCompressedTally>;
export type CandidateContestWithoutWriteInsCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  ...candidates: number[]
];
export const CandidateContestWithoutWriteInsCompressedTallySchema: z.ZodSchema<CandidateContestWithoutWriteInsCompressedTally> =
  z
    .array(nonnegativeInteger)
    .min(
      3
    ) as unknown as z.ZodSchema<CandidateContestWithoutWriteInsCompressedTally>;
export type CandidateContestCompressedTally =
  | CandidateContestWithWriteInsCompressedTally
  | CandidateContestWithoutWriteInsCompressedTally;
export const CandidateContestCompressedTallySchema: z.ZodSchema<CandidateContestCompressedTally> =
  z.union([
    CandidateContestWithWriteInsCompressedTallySchema,
    CandidateContestWithoutWriteInsCompressedTallySchema,
  ]);
export type MsEitherNeitherContestCompressedTally = [
  eitherOption: number,
  neitherOption: number,
  eitherNeitherUndervotes: number,
  eitherNeitherOvervotes: number,
  firstOption: number,
  secondOption: number,
  pickOneUndervotes: number,
  pickOneOvervotes: number,
  ballotsCast: number
];
export const MsEitherNeitherContestCompressedTallySchema: z.ZodSchema<MsEitherNeitherContestCompressedTally> =
  z.tuple([
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
    nonnegativeInteger,
  ]);
export type CompressedTallyEntry =
  | YesNoContestCompressedTally
  | CandidateContestCompressedTally
  | MsEitherNeitherContestCompressedTally;
export type CompressedTally = CompressedTallyEntry[];
export const CompressedTallySchema: z.ZodSchema<CompressedTally> = z.array(
  z.union([
    YesNoContestCompressedTallySchema,
    CandidateContestCompressedTallySchema,
    MsEitherNeitherContestCompressedTallySchema,
  ])
);

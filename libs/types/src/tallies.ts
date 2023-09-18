import { z } from 'zod';
import { CastVoteRecord } from './cast_vote_records';
import { Candidate, AnyContest, YesNoContestOptionId } from './election';
import { Dictionary } from './generic';

export type ContestVoteOption = Candidate | YesNoContestOptionId;

export interface ContestOptionTally {
  readonly option: ContestVoteOption;
  readonly tally: number;
}

export interface ContestTally {
  readonly contest: AnyContest;
  readonly tallies: Dictionary<ContestOptionTally>;
  readonly metadata: ContestTallyMeta;
}

export interface ContestTallyMeta {
  readonly overvotes: number;
  readonly undervotes: number;
  readonly ballots: number;
}

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

export interface ManualTally {
  readonly contestTallies: Dictionary<ContestTally>;
  readonly numberOfBallotsCounted: number;
}

export enum VotingMethod {
  Absentee = 'absentee',
  Precinct = 'precinct',
  Unknown = 'unknown',
}

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
export type CompressedTallyEntry =
  | YesNoContestCompressedTally
  | CandidateContestCompressedTally;
export type CompressedTally = CompressedTallyEntry[];
export const CompressedTallySchema: z.ZodSchema<CompressedTally> = z.array(
  z.union([
    YesNoContestCompressedTallySchema,
    CandidateContestCompressedTallySchema,
  ])
);

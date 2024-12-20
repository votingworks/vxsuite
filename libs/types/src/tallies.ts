import { z } from 'zod';

const nonnegativeInteger = z.number().nonnegative().int();

export type YesNoContestCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  yes: number,
  no: number,
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
  writeIns: number,
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
  ...candidates: number[],
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

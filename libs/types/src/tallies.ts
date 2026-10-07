import { z } from 'zod/v4';

const nonnegativeInteger = z.number().nonnegative().int();

// [undervotes, overvotes, ballotsCast, ...optionTallies]
// optionTallies has one entry per contest option, in options[] order.
// Minimum length 5 = 3 metadata + 2 options (required minimum for yesno).
export type YesNoContestCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  firstOption: number,
  secondOption: number,
  ...additionalOptions: number[],
];
export const YesNoContestCompressedTallySchema: z.ZodSchema<YesNoContestCompressedTally> =
  z
    .array(nonnegativeInteger)
    .min(5) as unknown as z.ZodSchema<YesNoContestCompressedTally>;
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

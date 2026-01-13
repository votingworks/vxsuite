import { z } from 'zod/v4';

const nonnegativeInteger = z.number().nonnegative().int();

export const YesNoContestCompressedTallySchema = z.tuple([
  nonnegativeInteger,
  nonnegativeInteger,
  nonnegativeInteger,
  nonnegativeInteger,
  nonnegativeInteger,
]);

export type YesNoContestCompressedTally = z.infer<
  typeof YesNoContestCompressedTallySchema
>;
export const CandidateContestWithWriteInsCompressedTallySchema = z
  .array(nonnegativeInteger)
  .min(
    4
  ) as unknown as z.ZodSchema<CandidateContestWithWriteInsCompressedTally>;

export type CandidateContestWithWriteInsCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  ...candidates: number[],
  writeIns: number,
];
export const CandidateContestWithoutWriteInsCompressedTallySchema = z
  .array(nonnegativeInteger)
  .min(
    3
  ) as unknown as z.ZodSchema<CandidateContestWithoutWriteInsCompressedTally>;

export type CandidateContestWithoutWriteInsCompressedTally = [
  undervotes: number,
  overvotes: number,
  ballotsCast: number,
  ...candidates: number[],
];
export const CandidateContestCompressedTallySchema = z.union([
  CandidateContestWithWriteInsCompressedTallySchema,
  CandidateContestWithoutWriteInsCompressedTallySchema,
]);

export type CandidateContestCompressedTally =
  | CandidateContestWithWriteInsCompressedTally
  | CandidateContestWithoutWriteInsCompressedTally;
export type CompressedTallyEntry =
  | YesNoContestCompressedTally
  | CandidateContestCompressedTally;
export const CompressedTallySchema = z.array(
  z.union([
    YesNoContestCompressedTallySchema,
    CandidateContestCompressedTallySchema,
  ])
);

export type CompressedTally = z.infer<typeof CompressedTallySchema>;

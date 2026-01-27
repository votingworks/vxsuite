import { z } from 'zod/v4';
import {
  AdjudicationInfo,
  AdjudicationInfoSchema,
  AdjudicationReason,
  AdjudicationReasonInfo,
  AdjudicationReasonSchema,
  BallotMetadata,
  BallotMetadataSchema,
  BmdMultiPageBallotPageMetadata,
  BmdMultiPageBallotPageMetadataSchema,
  ContestId,
  ContestIdSchema,
  HmpbBallotPageMetadata,
  HmpbBallotPageMetadataSchema,
  MarkInfo,
  MarkInfoSchema,
  VotesDict,
  VotesDictSchema,
  WriteInId,
  WriteInIdSchema,
} from './election';
import {
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
} from './generic';
import { BallotPageLayout, BallotPageLayoutSchema, SheetOf } from './hmpb';

export interface BlankPage {
  type: 'BlankPage';
}
export const BlankPageSchema: z.ZodSchema<BlankPage> = z.object({
  type: z.literal('BlankPage'),
});

export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage';
  metadata: BallotMetadata;
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
}
export const InterpretedBmdPageSchema: z.ZodSchema<InterpretedBmdPage> =
  z.object({
    type: z.literal('InterpretedBmdPage'),
    metadata: BallotMetadataSchema,
    votes: VotesDictSchema,
    adjudicationInfo: AdjudicationInfoSchema,
  });

/**
 * Interpretation result for a single page of a multi-page BMD ballot.
 */
export interface InterpretedBmdMultiPagePage {
  type: 'InterpretedBmdMultiPagePage';
  metadata: BmdMultiPageBallotPageMetadata;
  /** Votes for only the contests on this page */
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
}
export const InterpretedBmdMultiPagePageSchema: z.ZodSchema<InterpretedBmdMultiPagePage> =
  z.object({
    type: z.literal('InterpretedBmdMultiPagePage'),
    metadata: BmdMultiPageBallotPageMetadataSchema,
    votes: VotesDictSchema,
    adjudicationInfo: AdjudicationInfoSchema,
  });

export interface UnmarkedWriteIn {
  contestId: ContestId;
  optionId: WriteInId;
}

export const UnmarkedWriteInSchema: z.ZodSchema<UnmarkedWriteIn> = z.object({
  contestId: ContestIdSchema,
  optionId: WriteInIdSchema,
});

export interface InterpretedHmpbPage {
  type: 'InterpretedHmpbPage';
  metadata: HmpbBallotPageMetadata;
  markInfo: MarkInfo;
  unmarkedWriteIns?: UnmarkedWriteIn[];
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
  layout: BallotPageLayout;
}
export const InterpretedHmpbPageSchema: z.ZodSchema<InterpretedHmpbPage> =
  z.object({
    type: z.literal('InterpretedHmpbPage'),
    metadata: HmpbBallotPageMetadataSchema,
    markInfo: MarkInfoSchema,
    unmarkedWriteIns: z.array(UnmarkedWriteInSchema).optional(),
    votes: VotesDictSchema,
    adjudicationInfo: AdjudicationInfoSchema,
    layout: BallotPageLayoutSchema,
  });

export interface InvalidBallotHashPage {
  type: 'InvalidBallotHashPage';
  expectedBallotHash: string;
  actualBallotHash: string;
}
export const InvalidBallotHashPageSchema: z.ZodSchema<InvalidBallotHashPage> =
  z.object({
    type: z.literal('InvalidBallotHashPage'),
    expectedBallotHash: z.string(),
    actualBallotHash: z.string(),
  });

export interface InvalidTestModePage {
  type: 'InvalidTestModePage';
  metadata: BallotMetadata | HmpbBallotPageMetadata;
}
export const InvalidTestModePageSchema: z.ZodSchema<InvalidTestModePage> =
  z.object({
    type: z.literal('InvalidTestModePage'),
    metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
  });

export interface InvalidPrecinctPage {
  type: 'InvalidPrecinctPage';
  metadata: BallotMetadata | HmpbBallotPageMetadata;
}
export const InvalidPrecinctPageSchema: z.ZodSchema<InvalidPrecinctPage> =
  z.object({
    type: z.literal('InvalidPrecinctPage'),
    metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
  });

export interface UnreadablePage {
  type: 'UnreadablePage';
  reason?: string;
}
export const UnreadablePageSchema: z.ZodSchema<UnreadablePage> = z.object({
  type: z.literal('UnreadablePage'),
  reason: z.string().optional(),
});

export type PageInterpretation =
  | BlankPage
  | InterpretedBmdPage
  | InterpretedBmdMultiPagePage
  | InterpretedHmpbPage
  | InvalidBallotHashPage
  | InvalidTestModePage
  | InvalidPrecinctPage
  | UnreadablePage;
export const PageInterpretationSchema: z.ZodSchema<PageInterpretation> =
  z.union([
    BlankPageSchema,
    InterpretedBmdPageSchema,
    InterpretedBmdMultiPagePageSchema,
    InterpretedHmpbPageSchema,
    InvalidBallotHashPageSchema,
    InvalidTestModePageSchema,
    InvalidPrecinctPageSchema,
    UnreadablePageSchema,
  ]);

export type PageInterpretationType = PageInterpretation['type'];

export interface PageInterpretationWithFiles {
  imagePath: string;
  interpretation: PageInterpretation;
}
export const PageInterpretationWithFilesSchema: z.ZodSchema<PageInterpretationWithFiles> =
  z.object({
    imagePath: z.string(),
    interpretation: PageInterpretationSchema,
  });

export interface BallotPageInfo {
  interpretation: PageInterpretation;
  adjudicationFinishedAt?: Iso8601Timestamp;
}
export const BallotPageInfoSchema: z.ZodSchema<BallotPageInfo> = z.object({
  interpretation: PageInterpretationSchema,
  adjudicationFinishedAt: Iso8601TimestampSchema.optional(),
});

export interface BallotSheetInfo {
  id: Id;
  front: BallotPageInfo;
  back: BallotPageInfo;
  adjudicationReason?: AdjudicationReason;
}
export const BallotSheetInfoSchema: z.ZodSchema<BallotSheetInfo> = z.object({
  id: IdSchema,
  front: BallotPageInfoSchema,
  back: BallotPageInfoSchema,
  adjudicationReason: AdjudicationReasonSchema.optional(),
});

export type InvalidInterpretationReason =
  | 'bmd_ballot_scanning_disabled'
  | 'invalid_test_mode'
  | 'invalid_ballot_hash'
  | 'invalid_precinct'
  | 'vertical_streaks_detected'
  | 'invalid_scale'
  | 'unreadable'
  | 'unknown';

export type SheetInterpretation =
  | {
      type: 'ValidSheet';
    }
  | {
      type: 'InvalidSheet';
      reason: InvalidInterpretationReason;
    }
  | {
      type: 'NeedsReviewSheet';
      reasons: AdjudicationReasonInfo[];
    };

/**
 * An interpretation for one ballot sheet that includes both the interpretation
 * result for the sheet as a whole and the individual page (i.e. front and back)
 * interpretations.
 */
export type SheetInterpretationWithPages = SheetInterpretation & {
  pages: SheetOf<PageInterpretationWithFiles>;
};

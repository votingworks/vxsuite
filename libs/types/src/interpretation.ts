import { z } from 'zod/v4';
import {
  AdjudicationInfo,
  AdjudicationInfoSchema,
  AdjudicationReasonInfo,
  BallotMetadata,
  BallotMetadataSchema,
  SummaryBallotPageMetadata,
  SummaryBallotPageMetadataSchema,
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
import { BallotPageLayout, BallotPageLayoutSchema, SheetOf } from './hmpb';

export interface BlankPage {
  type: 'BlankPage';
}
export const BlankPageSchema: z.ZodSchema<BlankPage> = z.object({
  type: z.literal('BlankPage'),
});

/**
 * Interpretation result for a single page of a BMD ballot.
 */
export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage';
  metadata: SummaryBallotPageMetadata;
  /** Votes for only the contests on this page */
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
}
export const InterpretedBmdPageSchema: z.ZodSchema<InterpretedBmdPage> =
  z.object({
    type: z.literal('InterpretedBmdPage'),
    metadata: SummaryBallotPageMetadataSchema,
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
  | InterpretedHmpbPage
  | InvalidBallotHashPage
  | InvalidTestModePage
  | InvalidPrecinctPage
  | UnreadablePage;
export const PageInterpretationSchema: z.ZodSchema<PageInterpretation> =
  z.union([
    BlankPageSchema,
    InterpretedBmdPageSchema,
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

export type InvalidInterpretationReasonInfo =
  | {
      type: 'invalid_ballot_hash';
      actualBallotHash: string;
    }
  | {
      type:
        | 'bmd_ballot_scanning_disabled'
        | 'invalid_test_mode'
        | 'invalid_precinct'
        | 'vertical_streaks_detected'
        | 'invalid_scale'
        | 'unreadable'
        | 'unknown';
    };

export type InvalidInterpretationReason =
  InvalidInterpretationReasonInfo['type'];

export type SheetInterpretation =
  | {
      type: 'ValidSheet';
    }
  | {
      type: 'InvalidSheet';
      reason: InvalidInterpretationReasonInfo;
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

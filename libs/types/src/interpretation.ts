import { z } from 'zod/v4';
import {
  AdjudicationInfo,
  AdjudicationInfoSchema,
  AdjudicationReason,
  AdjudicationReasonInfo,
  AdjudicationReasonSchema,
  BallotMetadata,
  BallotMetadataSchema,
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

export const BlankPageSchema = z.object({
  type: z.literal('BlankPage'),
});

export interface BlankPage extends z.infer<typeof BlankPageSchema> {}

export const InterpretedBmdPageSchema = z.object({
  type: z.literal('InterpretedBmdPage'),
  metadata: BallotMetadataSchema,
  votes: VotesDictSchema,
  adjudicationInfo: AdjudicationInfoSchema,
});

export interface InterpretedBmdPage
  extends z.infer<typeof InterpretedBmdPageSchema> {}

export const UnmarkedWriteInSchema = z.object({
  contestId: ContestIdSchema,
  optionId: WriteInIdSchema,
});

export interface UnmarkedWriteIn
  extends z.infer<typeof UnmarkedWriteInSchema> {}

export const InterpretedHmpbPageSchema = z.object({
  type: z.literal('InterpretedHmpbPage'),
  metadata: HmpbBallotPageMetadataSchema,
  markInfo: MarkInfoSchema,
  unmarkedWriteIns: z.array(UnmarkedWriteInSchema).optional(),
  votes: VotesDictSchema,
  adjudicationInfo: AdjudicationInfoSchema,
  layout: BallotPageLayoutSchema,
});

export interface InterpretedHmpbPage
  extends z.infer<typeof InterpretedHmpbPageSchema> {}

export const InvalidBallotHashPageSchema = z.object({
  type: z.literal('InvalidBallotHashPage'),
  expectedBallotHash: z.string(),
  actualBallotHash: z.string(),
});

export interface InvalidBallotHashPage
  extends z.infer<typeof InvalidBallotHashPageSchema> {}

export const InvalidTestModePageSchema = z.object({
  type: z.literal('InvalidTestModePage'),
  metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
});

export interface InvalidTestModePage
  extends z.infer<typeof InvalidTestModePageSchema> {}

export const InvalidPrecinctPageSchema = z.object({
  type: z.literal('InvalidPrecinctPage'),
  metadata: z.union([BallotMetadataSchema, HmpbBallotPageMetadataSchema]),
});

export interface InvalidPrecinctPage
  extends z.infer<typeof InvalidPrecinctPageSchema> {}

export const UnreadablePageSchema = z.object({
  type: z.literal('UnreadablePage'),
  reason: z.string().optional(),
});

export interface UnreadablePage extends z.infer<typeof UnreadablePageSchema> {}

export const PageInterpretationSchema = z.union([
  BlankPageSchema,
  InterpretedBmdPageSchema,
  InterpretedHmpbPageSchema,
  InvalidBallotHashPageSchema,
  InvalidTestModePageSchema,
  InvalidPrecinctPageSchema,
  UnreadablePageSchema,
]);

export type PageInterpretation = z.infer<typeof PageInterpretationSchema>;

export type PageInterpretationType = PageInterpretation['type'];

export const PageInterpretationWithFilesSchema = z.object({
  imagePath: z.string(),
  interpretation: PageInterpretationSchema,
});

export interface PageInterpretationWithFiles
  extends z.infer<typeof PageInterpretationWithFilesSchema> {}

export const BallotPageInfoSchema = z.object({
  interpretation: PageInterpretationSchema,
  adjudicationFinishedAt: Iso8601TimestampSchema.optional(),
});

export interface BallotPageInfo extends z.infer<typeof BallotPageInfoSchema> {}

export const BallotSheetInfoSchema = z.object({
  id: IdSchema,
  front: BallotPageInfoSchema,
  back: BallotPageInfoSchema,
  adjudicationReason: AdjudicationReasonSchema.optional(),
});

export interface BallotSheetInfo extends z.infer<typeof BallotSheetInfoSchema> {}

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

import * as z from 'zod';
import {
  AdjudicationInfo,
  AdjudicationInfoSchema,
  AdjudicationReason,
  AdjudicationReasonSchema,
  BallotId,
  BallotIdSchema,
  BallotMetadata,
  BallotMetadataSchema,
  HmpbBallotPageMetadata,
  HmpbBallotPageMetadataSchema,
  MarkInfo,
  MarkInfoSchema,
  VotesDict,
  VotesDictSchema,
} from './election';
import {
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
} from './generic';
import { BallotPageLayout, BallotPageLayoutSchema } from './hmpb';

export interface BlankPage {
  type: 'BlankPage';
}
export const BlankPageSchema: z.ZodSchema<BlankPage> = z.object({
  type: z.literal('BlankPage'),
});

export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage';
  ballotId?: BallotId;
  metadata: BallotMetadata;
  votes: VotesDict;
}
export const InterpretedBmdPageSchema: z.ZodSchema<InterpretedBmdPage> =
  z.object({
    type: z.literal('InterpretedBmdPage'),
    ballotId: BallotIdSchema.optional(),
    metadata: BallotMetadataSchema,
    votes: VotesDictSchema,
  });

export interface InterpretedHmpbPage {
  type: 'InterpretedHmpbPage';
  ballotId?: BallotId;
  metadata: HmpbBallotPageMetadata;
  markInfo: MarkInfo;
  votes: VotesDict;
  adjudicationInfo: AdjudicationInfo;
  layout?: BallotPageLayout;
}
export const InterpretedHmpbPageSchema: z.ZodSchema<InterpretedHmpbPage> =
  z.object({
    type: z.literal('InterpretedHmpbPage'),
    ballotId: BallotIdSchema.optional(),
    metadata: HmpbBallotPageMetadataSchema,
    markInfo: MarkInfoSchema,
    votes: VotesDictSchema,
    adjudicationInfo: AdjudicationInfoSchema,
    layout: BallotPageLayoutSchema.optional(),
  });

export interface InvalidElectionHashPage {
  type: 'InvalidElectionHashPage';
  expectedElectionHash: string;
  actualElectionHash: string;
}
export const InvalidElectionHashPageSchema: z.ZodSchema<InvalidElectionHashPage> =
  z.object({
    type: z.literal('InvalidElectionHashPage'),
    expectedElectionHash: z.string(),
    actualElectionHash: z.string(),
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

export interface UninterpretedHmpbPage {
  type: 'UninterpretedHmpbPage';
  metadata: HmpbBallotPageMetadata;
}
export const UninterpretedHmpbPageSchema: z.ZodSchema<UninterpretedHmpbPage> =
  z.object({
    type: z.literal('UninterpretedHmpbPage'),
    metadata: HmpbBallotPageMetadataSchema,
  });

export interface UnreadablePage {
  type: 'UnreadablePage';
  reason?: string;
}
export const UnreadablePageSchema: z.ZodSchema<UnreadablePage> = z.object({
  type: z.literal('UnreadablePage'),
  reason: z.string().optional(),
});

export interface ImageInfo {
  url: string;
}
export const ImageInfoSchema: z.ZodSchema<ImageInfo> = z.object({
  url: z.string(),
});

export type PageInterpretation =
  | BlankPage
  | InterpretedBmdPage
  | InterpretedHmpbPage
  | InvalidElectionHashPage
  | InvalidTestModePage
  | InvalidPrecinctPage
  | UninterpretedHmpbPage
  | UnreadablePage;
export const PageInterpretationSchema: z.ZodSchema<PageInterpretation> =
  z.union([
    BlankPageSchema,
    InterpretedBmdPageSchema,
    InterpretedHmpbPageSchema,
    InvalidElectionHashPageSchema,
    InvalidTestModePageSchema,
    InvalidPrecinctPageSchema,
    UninterpretedHmpbPageSchema,
    UnreadablePageSchema,
  ]);

export interface PageInterpretationWithFiles {
  originalFilename: string;
  normalizedFilename: string;
  interpretation: PageInterpretation;
}
export const PageInterpretationWithFilesSchema: z.ZodSchema<PageInterpretationWithFiles> =
  z.object({
    originalFilename: z.string(),
    normalizedFilename: z.string(),
    interpretation: PageInterpretationSchema,
  });

export interface BallotPageInfo {
  image: ImageInfo;
  interpretation: PageInterpretation;
  adjudicationFinishedAt?: Iso8601Timestamp;
}
export const BallotPageInfoSchema: z.ZodSchema<BallotPageInfo> = z.object({
  image: ImageInfoSchema,
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

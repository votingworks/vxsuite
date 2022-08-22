import { z } from 'zod';
import {
  AdjudicationReason,
  Contest,
  ContestId,
  ContestOption,
  ContestOptionSchema,
  HmpbBallotPageMetadata,
  HmpbBallotPageMetadataSchema,
  TargetShape,
  TargetShapeSchema,
} from './election';
import { IdSchema } from './generic';
import {
  Corners,
  CornersSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';
import { ImageData, ImageDataSchema } from './image';

export type BallotPageMetadata = HmpbBallotPageMetadata;
export const BallotPageMetadataSchema = HmpbBallotPageMetadataSchema;

export interface BallotImage {
  imageData: ImageData;
  metadata: BallotPageMetadata;
}
export const BallotImageSchema: z.ZodSchema<BallotImage> = z.object({
  imageData: ImageDataSchema,
  metadata: BallotPageMetadataSchema,
});

export interface BallotPageContestOptionLayout {
  definition?: ContestOption;
  bounds: Rect;
  target: TargetShape;
}
export const BallotPageContestOptionLayoutSchema: z.ZodSchema<BallotPageContestOptionLayout> =
  z.object({
    definition: ContestOptionSchema.optional(),
    bounds: RectSchema,
    target: TargetShapeSchema,
  });

export interface BallotPageContestLayout {
  contestId?: ContestId;
  bounds: Rect;
  corners: Corners;
  options: readonly BallotPageContestOptionLayout[];
}
export const BallotPageContestLayoutSchema: z.ZodSchema<BallotPageContestLayout> =
  z.object({
    contestId: IdSchema.optional(),
    bounds: RectSchema,
    corners: CornersSchema,
    options: z.array(BallotPageContestOptionLayoutSchema),
  });

export interface BallotPageLayout {
  pageSize: Size;
  metadata: BallotPageMetadata;
  contests: readonly BallotPageContestLayout[];
}
export const BallotPageLayoutSchema: z.ZodSchema<BallotPageLayout> = z.object({
  pageSize: SizeSchema,
  metadata: BallotPageMetadataSchema,
  contests: z.array(BallotPageContestLayoutSchema),
});

export interface BallotPageLayoutWithImage {
  imageData: ImageData;
  ballotPageLayout: BallotPageLayout;
}
export const BallotPageLayoutWithImageSchema: z.ZodSchema<BallotPageLayoutWithImage> =
  z.object({
    imageData: ImageDataSchema,
    ballotPageLayout: BallotPageLayoutSchema,
  });

export enum MarkStatus {
  Marked = 'marked',
  Unmarked = 'unmarked',
  Marginal = 'marginal',
}
export const MarkStatusSchema: z.ZodSchema<MarkStatus> =
  z.nativeEnum(MarkStatus);

export interface MarksByOptionId {
  [key: string]: MarkStatus | undefined;
}
export const MarksByOptionIdSchema: z.ZodSchema<MarksByOptionId> = z.record(
  MarkStatusSchema.optional()
);

export interface MarksByContestId {
  [key: string]: MarksByOptionId | undefined;
}
export const MarksByContestIdSchema: z.ZodSchema<MarksByContestId> = z.record(
  MarksByOptionIdSchema.optional()
);

export interface UninterpretableBallotMarkAdjudication {
  readonly type: AdjudicationReason.UninterpretableBallot;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const UninterpretableBallotMarkAdjudicationSchema: z.ZodSchema<UninterpretableBallotMarkAdjudication> =
  z.object({
    type: z.literal(AdjudicationReason.UninterpretableBallot),
    contestId: IdSchema,
    optionId: IdSchema,
    isMarked: z.boolean(),
  });

export interface OvervoteMarkAdjudication {
  readonly type: AdjudicationReason.Overvote;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const OvervoteMarkAdjudicationSchema: z.ZodSchema<OvervoteMarkAdjudication> =
  z.object({
    type: z.literal(AdjudicationReason.Overvote),
    contestId: IdSchema,
    optionId: IdSchema,
    isMarked: z.boolean(),
  });

export interface UndervoteMarkAdjudication {
  readonly type: AdjudicationReason.Undervote;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const UndervoteMarkAdjudicationSchema: z.ZodSchema<UndervoteMarkAdjudication> =
  z.object({
    type: z.literal(AdjudicationReason.Undervote),
    contestId: IdSchema,
    optionId: IdSchema,
    isMarked: z.boolean(),
  });

export interface MarginalMarkAdjudication {
  readonly type: AdjudicationReason.MarginalMark;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const MarginalMarkAdjudicationSchema: z.ZodSchema<MarginalMarkAdjudication> =
  z.object({
    type: z.literal(AdjudicationReason.MarginalMark),
    contestId: IdSchema,
    optionId: IdSchema,
    isMarked: z.boolean(),
  });

export type MarkAdjudication =
  | UninterpretableBallotMarkAdjudication
  | OvervoteMarkAdjudication
  | UndervoteMarkAdjudication
  | MarginalMarkAdjudication;
export const MarkAdjudicationSchema: z.ZodSchema<MarkAdjudication> = z.union([
  UninterpretableBallotMarkAdjudicationSchema,
  OvervoteMarkAdjudicationSchema,
  UndervoteMarkAdjudicationSchema,
  MarginalMarkAdjudicationSchema,
]);

export type MarkAdjudications = readonly MarkAdjudication[];
export const MarkAdjudicationsSchema: z.ZodSchema<MarkAdjudications> = z.array(
  MarkAdjudicationSchema
);

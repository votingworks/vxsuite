import { z } from 'zod';
import {
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

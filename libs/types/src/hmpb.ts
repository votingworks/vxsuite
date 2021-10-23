import { z } from 'zod';
import {
  AdjudicationReason,
  Candidate,
  Contest,
  ContestIdSchema,
  ContestOption,
  HMPBBallotPageMetadata,
  HMPBBallotPageMetadataSchema,
  TargetShape,
  TargetShapeSchema,
} from './election';
import { Id, WriteInId } from './generic';
import {
  Corners,
  CornersSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';
import { ImageData, ImageDataSchema } from './image';

export type BallotPageMetadata = HMPBBallotPageMetadata;
export const BallotPageMetadataSchema = HMPBBallotPageMetadataSchema;

export interface BallotImage {
  imageData: ImageData;
  metadata: BallotPageMetadata;
}
export const BallotImageSchema: z.ZodSchema<BallotImage> = z.object({
  imageData: ImageDataSchema,
  metadata: BallotPageMetadataSchema,
});

export interface BallotPageContestOptionLayout {
  bounds: Rect;
  target: TargetShape;
}
export const BallotPageContestOptionLayoutSchema: z.ZodSchema<BallotPageContestOptionLayout> = z.object(
  {
    bounds: RectSchema,
    target: TargetShapeSchema,
  }
);

export interface BallotPageContestLayout {
  bounds: Rect;
  corners: Corners;
  options: readonly BallotPageContestOptionLayout[];
}
export const BallotPageContestLayoutSchema: z.ZodSchema<BallotPageContestLayout> = z.object(
  {
    bounds: RectSchema,
    corners: CornersSchema,
    options: z.array(BallotPageContestOptionLayoutSchema),
  }
);

export interface BallotPageLayout {
  ballotImage: BallotImage;
  contests: readonly BallotPageContestLayout[];
}
export const BallotPageLayoutSchema: z.ZodSchema<BallotPageLayout> = z.object({
  ballotImage: BallotImageSchema,
  contests: z.array(BallotPageContestLayoutSchema),
});

export type SerializableBallotPageLayout = Omit<
  BallotPageLayout,
  'ballotImage'
> & {
  ballotImage: Omit<BallotPageLayout['ballotImage'], 'imageData'> & {
    imageData: Size;
  };
};
export const SerializableBallotPageLayoutSchema: z.ZodSchema<SerializableBallotPageLayout> = z.object(
  {
    ballotImage: z.object({
      imageData: SizeSchema,
      metadata: BallotPageMetadataSchema,
    }),
    contests: z.array(BallotPageContestLayoutSchema),
  }
);

export enum MarkStatus {
  Marked = 'marked',
  Unmarked = 'unmarked',
  Marginal = 'marginal',
  UnmarkedWriteIn = 'unmarkedWriteIn',
}
export const MarkStatusSchema: z.ZodSchema<MarkStatus> = z.nativeEnum(
  MarkStatus
);

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
export const UninterpretableBallotMarkAdjudicationSchema: z.ZodSchema<UninterpretableBallotMarkAdjudication> = z.object(
  {
    type: z.literal(AdjudicationReason.UninterpretableBallot),
    contestId: ContestIdSchema,
    optionId: Id,
    isMarked: z.boolean(),
  }
);

export interface OvervoteMarkAdjudication {
  readonly type: AdjudicationReason.Overvote;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const OvervoteMarkAdjudicationSchema: z.ZodSchema<OvervoteMarkAdjudication> = z.object(
  {
    type: z.literal(AdjudicationReason.Overvote),
    contestId: ContestIdSchema,
    optionId: Id,
    isMarked: z.boolean(),
  }
);

export interface UndervoteMarkAdjudication {
  readonly type: AdjudicationReason.Undervote;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const UndervoteMarkAdjudicationSchema: z.ZodSchema<UndervoteMarkAdjudication> = z.object(
  {
    type: z.literal(AdjudicationReason.Undervote),
    contestId: ContestIdSchema,
    optionId: Id,
    isMarked: z.boolean(),
  }
);

export interface MarginalMarkAdjudication {
  readonly type: AdjudicationReason.MarginalMark;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly isMarked: boolean;
}
export const MarginalMarkAdjudicationSchema: z.ZodSchema<MarginalMarkAdjudication> = z.object(
  {
    type: z.literal(AdjudicationReason.MarginalMark),
    contestId: ContestIdSchema,
    optionId: Id,
    isMarked: z.boolean(),
  }
);

export interface WriteInMarkAdjudicationMarked {
  readonly type:
    | AdjudicationReason.WriteIn
    | AdjudicationReason.UnmarkedWriteIn;
  readonly isMarked: true;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
  readonly name: Candidate['name'];
}
export const WriteInMarkAdjudicationMarkedSchema: z.ZodSchema<WriteInMarkAdjudicationMarked> = z.object(
  {
    type: z.union([
      z.literal(AdjudicationReason.WriteIn),
      z.literal(AdjudicationReason.UnmarkedWriteIn),
    ]),
    isMarked: z.literal(true),
    contestId: ContestIdSchema,
    optionId: WriteInId,
    name: z.string(),
  }
);

export interface WriteInMarkAdjudicationUnmarked {
  readonly type:
    | AdjudicationReason.WriteIn
    | AdjudicationReason.UnmarkedWriteIn;
  readonly isMarked: false;
  readonly contestId: Contest['id'];
  readonly optionId: ContestOption['id'];
}
export const WriteInMarkAdjudicationUnmarkedSchema: z.ZodSchema<WriteInMarkAdjudicationUnmarked> = z.object(
  {
    type: z.union([
      z.literal(AdjudicationReason.WriteIn),
      z.literal(AdjudicationReason.UnmarkedWriteIn),
    ]),
    isMarked: z.literal(false),
    contestId: ContestIdSchema,
    optionId: WriteInId,
  }
);

export type WriteInMarkAdjudication =
  | WriteInMarkAdjudicationMarked
  | WriteInMarkAdjudicationUnmarked;
export const WriteInMarkAdjudicationSchema: z.ZodSchema<WriteInMarkAdjudication> = z.union(
  [WriteInMarkAdjudicationMarkedSchema, WriteInMarkAdjudicationUnmarkedSchema]
);

export type MarkAdjudication =
  | UninterpretableBallotMarkAdjudication
  | OvervoteMarkAdjudication
  | UndervoteMarkAdjudication
  | MarginalMarkAdjudication
  | WriteInMarkAdjudication;
export const MarkAdjudicationSchema: z.ZodSchema<MarkAdjudication> = z.union([
  UninterpretableBallotMarkAdjudicationSchema,
  OvervoteMarkAdjudicationSchema,
  UndervoteMarkAdjudicationSchema,
  MarginalMarkAdjudicationSchema,
  WriteInMarkAdjudicationSchema,
]);

export type MarkAdjudications = readonly MarkAdjudication[];
export const MarkAdjudicationsSchema: z.ZodSchema<MarkAdjudications> = z.array(
  MarkAdjudicationSchema
);

import { z } from 'zod'
import {
  HMPBBallotPageMetadata,
  HMPBBallotPageMetadataSchema,
  TargetShape,
  TargetShapeSchema,
} from './election'
import {
  Corners,
  CornersSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry'
import { ImageData, ImageDataSchema } from './image'

export type BallotPageMetadata = HMPBBallotPageMetadata
export const BallotPageMetadataSchema = HMPBBallotPageMetadataSchema

export interface BallotImage {
  imageData: ImageData
  metadata: BallotPageMetadata
}
export const BallotImageSchema: z.ZodSchema<BallotImage> = z.object({
  imageData: ImageDataSchema,
  metadata: BallotPageMetadataSchema,
})

export interface BallotPageContestOptionLayout {
  bounds: Rect
  target: TargetShape
}
export const BallotPageContestOptionLayoutSchema: z.ZodSchema<BallotPageContestOptionLayout> = z.object(
  {
    bounds: RectSchema,
    target: TargetShapeSchema,
  }
)

export interface BallotPageContestLayout {
  bounds: Rect
  corners: Corners
  options: readonly BallotPageContestOptionLayout[]
}
export const BallotPageContestLayoutSchema: z.ZodSchema<BallotPageContestLayout> = z.object(
  {
    bounds: RectSchema,
    corners: CornersSchema,
    options: z.array(BallotPageContestOptionLayoutSchema),
  }
)

export interface BallotPageLayout {
  ballotImage: BallotImage
  contests: readonly BallotPageContestLayout[]
}
export const BallotPageLayoutSchema: z.ZodSchema<BallotPageLayout> = z.object({
  ballotImage: BallotImageSchema,
  contests: z.array(BallotPageContestLayoutSchema),
})

export type SerializableBallotPageLayout = Omit<
  BallotPageLayout,
  'ballotImage'
> & {
  ballotImage: Omit<BallotPageLayout['ballotImage'], 'imageData'> & {
    imageData: Size
  }
}
export const SerializableBallotPageLayoutSchema: z.ZodSchema<SerializableBallotPageLayout> = z.object(
  {
    ballotImage: z.object({
      imageData: SizeSchema,
      metadata: BallotPageMetadataSchema,
    }),
    contests: z.array(BallotPageContestLayoutSchema),
  }
)

import {
  BallotMark,
  CompletedBallot,
  Corners,
  HMPBBallotPageMetadata,
  Rect,
  TargetShape,
} from '@votingworks/types'

export interface BallotImage {
  imageData: ImageData
  metadata: BallotPageMetadata
}

export interface BallotPageLayout {
  ballotImage: BallotImage
  contests: readonly BallotPageContestLayout[]
}

export type BallotPageMetadata = HMPBBallotPageMetadata

export interface BallotPageContestLayout {
  bounds: Rect
  corners: Corners
  options: readonly BallotPageContestOptionLayout[]
}

export interface BallotPageContestOptionLayout {
  bounds: Rect
  target: TargetShape
}

export interface GetBallotOptions {
  markScoreVoteThreshold: number
}

export interface Interpreted {
  matchedTemplate: BallotPageLayout
  mappedBallot: ImageData
  metadata: BallotPageMetadata
  marks: BallotMark[]
  ballot: CompletedBallot
}

export interface FindMarksResult {
  matchedTemplate: BallotPageLayout
  mappedBallot: ImageData
  metadata: BallotPageMetadata
  marks: BallotMark[]
}

export interface UninterpretedBallot {
  ballotImage: BallotImage
  reason: string | Error
}

export interface Input {
  id(): string
  imageData(): Promise<ImageData>
  metadata?: () => Promise<BallotPageMetadata | undefined>
}

export interface DetectQRCode {
  (imageData: ImageData): Promise<DetectQRCodeResult | undefined>
}

export interface DetectQRCodeResult {
  data: Buffer
  rightSideUp?: boolean
}

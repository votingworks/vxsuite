import {
  AnyContest,
  Candidate,
  CandidateContest,
  CompletedBallot,
  MsEitherNeitherContest,
  v1,
  YesNoContest,
  YesNoOption,
} from '@votingworks/ballot-encoder'
import { TargetShape } from './hmpb/findTargets'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Corners = [Point, Point, Point, Point]

export interface Size {
  width: number
  height: number
}

export interface BallotImage {
  imageData: ImageData
  metadata: BallotPageMetadata
}

export interface BallotPageLayout {
  ballotImage: BallotImage
  contests: readonly BallotPageContestLayout[]
}

export interface BallotLocales {
  primary: string
  secondary?: string
}

export type BallotPageMetadata = v1.HMPBBallotPageMetadata

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

export type BallotMark = BallotStrayMark | BallotTargetMark

export interface BallotStrayMark {
  type: 'stray'
  bounds: Rect
  contest?: AnyContest
  option?: Candidate | 'yes' | 'no' | YesNoOption
}

export type BallotTargetMark =
  | BallotCandidateTargetMark
  | BallotYesNoTargetMark
  | BallotMsEitherNeitherTargetMark

export interface BallotCandidateTargetMark {
  type: CandidateContest['type']
  bounds: Rect
  contest: CandidateContest
  target: TargetShape
  option: Candidate
  score: number
}

export interface BallotYesNoTargetMark {
  type: YesNoContest['type']
  bounds: Rect
  contest: YesNoContest
  target: TargetShape
  option: 'yes' | 'no'
  score: number
}

export interface BallotMsEitherNeitherTargetMark {
  type: MsEitherNeitherContest['type']
  bounds: Rect
  contest: MsEitherNeitherContest
  target: TargetShape
  option: YesNoOption
  score: number
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

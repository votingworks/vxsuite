import {
  BallotStyle,
  Candidate,
  CandidateContest,
  CompletedBallot,
  Precinct,
  YesNoContest,
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

export interface BallotPageMetadata {
  locales?: BallotLocales
  ballotStyleId: BallotStyle['id']
  precinctId: Precinct['id']
  isTestBallot: boolean
  pageNumber: number
  pageCount: number
}

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
  contest?: YesNoContest | CandidateContest
  option?: Candidate | 'yes' | 'no'
}

export type BallotTargetMark = BallotCandidateTargetMark | BallotYesNoTargetMark

export interface BallotCandidateTargetMark {
  type: 'candidate'
  bounds: Rect
  contest: CandidateContest
  target: TargetShape
  option: Candidate
  score: number
}

export interface BallotYesNoTargetMark {
  type: 'yesno'
  bounds: Rect
  contest: YesNoContest
  target: TargetShape
  option: 'yes' | 'no'
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

export type PartialTemplateSpecifier =
  | { ballotStyleId: BallotStyle['id'] }
  | { ballotStyleId: BallotStyle['id']; precinctId: BallotStyle['id'] }
  | {
      ballotStyleId: BallotStyle['id']
      precinctId: BallotStyle['id']
      pageNumber: number
    }

import {
  BallotStyle,
  Candidate,
  CandidateContest,
  CompletedBallot,
  Precinct,
  YesNoContest,
} from '@votingworks/ballot-encoder'

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

export interface BallotPageMetadata {
  ballotStyleId: BallotStyle['id']
  precinctId: Precinct['id']
  isTestBallot: boolean
  pageNumber: number
  pageCount: number
}

export interface BallotPageContestLayout {
  bounds: Rect
  options: readonly BallotPageContestOptionLayout[]
}

export interface BallotPageContestOptionLayout {
  bounds: Rect
  target: Rect
}

export interface InterpretedBallot {
  matchedTemplate: BallotPageLayout
  ballot: CompletedBallot
  marks: readonly InterpretedBallotMark[]
}

export type InterpretedBallotMark =
  | InterpretedBallotStrayMark
  | InterpretedBallotTargetMark

export interface InterpretedBallotStrayMark {
  type: 'stray'
  bounds: Rect
  contest?: YesNoContest | CandidateContest
  choice?: Rect
}

export type InterpretedBallotTargetMark =
  | InterpretedBallotCandidateTargetMark
  | InterpretedBallotYesNoTargetMark

export interface InterpretedBallotCandidateTargetMark {
  type: 'candidate'
  bounds: Rect
  contest: CandidateContest
  target: Rect
  option: Candidate
  score: number
}

export interface InterpretedBallotYesNoTargetMark {
  type: 'yesno'
  bounds: Rect
  contest: YesNoContest
  target: Rect
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
}

export interface DetectQRCode {
  (imageData: ImageData): Promise<DetectQRCodeResult | undefined>
}

export interface DetectQRCodeResult {
  data: Buffer
  rightSideUp?: boolean
}

import {
  BallotStyle,
  CompletedBallot,
  Precinct,
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
  targets: readonly Rect[]
}

export interface InterpretedBallot {
  matchedTemplate: BallotPageLayout
  ballot: CompletedBallot
}

export interface UninterpretedBallot {
  ballotImage: BallotImage
  reason: string | Error
}

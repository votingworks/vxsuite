import { BallotStyle, Precinct } from '@votingworks/ballot-encoder'
import {
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  BallotTargetMark,
} from '@votingworks/hmpb-interpreter'
import { MarkInfo } from './interpreter'

export interface Dictionary<T> {
  [key: string]: T | undefined
}

export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean> {
  _precinctId: string
  _ballotStyleId: string
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
}

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}

export type BallotInfo = BmdBallotInfo | HmpbBallotInfo | UnreadableBallotInfo

export interface BmdBallotInfo {
  id: number
  filename: string
  cvr: CastVoteRecord
}

export interface HmpbBallotInfo {
  id: number
  filename: string
  cvr: CastVoteRecord
  marks: MarkInfo
  layout: SerializableBallotPageLayout
}

export interface UnreadableBallotInfo {
  id: number
  filename: string
}

export interface HmpbTemplateInfo {
  ballotStyleId: BallotStyle['id']
  precinctId: Precinct['id']
  pageNumber: number
  pageCount: number
}

export type BallotMetadata = Omit<
  BallotPageMetadata,
  'pageNumber' | 'pageCount'
>

export type SerializableBallotPageLayout = Omit<
  BallotPageLayout,
  'ballotImage'
> & {
  ballotImage: Omit<BallotPageLayout['ballotImage'], 'imageData'>
}

export * from './types/ballot-review'

export function isMarked(
  mark: BallotTargetMark,
  { marginalMarkMin = 0.1, validMarkMin = 0.8 } = {}
): boolean | undefined {
  if (mark.score >= validMarkMin) {
    return true
  }

  if (mark.score < marginalMarkMin) {
    return false
  }

  return undefined
}

export function isMarginalMark(
  mark: BallotMark,
  {
    marginalMarkMin,
    validMarkMin,
  }: { marginalMarkMin?: number; validMarkMin?: number } = {}
): boolean {
  return (
    mark.type !== 'stray' &&
    typeof isMarked(mark, { marginalMarkMin, validMarkMin }) === 'undefined'
  )
}

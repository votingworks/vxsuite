import { BallotStyle, Contest, Precinct } from '@votingworks/ballot-encoder'
import {
  BallotLocales,
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  BallotTargetMark,
} from '@votingworks/hmpb-interpreter'
import { MarkInfo } from './interpreter'
import { MarkStatus } from './types/ballot-review'

export interface Dictionary<T> {
  [key: string]: T | undefined
}

export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean | number | BallotLocales> {
  _precinctId: string
  _ballotStyleId: string
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
  _pageNumber?: number
  _locales?: BallotLocales
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

export interface BallotPackageManifest {
  ballots: readonly BallotConfig[]
}

export interface BallotStyleData {
  ballotStyleId: BallotStyle['id']
  contestIds: Contest['id'][]
  precinctId: Precinct['id']
}

export interface BallotConfig extends BallotStyleData {
  filename: string
  locales: BallotLocales
  isLiveMode: boolean
}

export * from './types/ballot-review'

export function getMarkStatus(
  mark: BallotTargetMark,
  { marginalMarkMin = 0.12, validMarkMin = 0.5 } = {}
): MarkStatus {
  if (mark.score >= validMarkMin) {
    return MarkStatus.Marked
  }

  if (mark.score < marginalMarkMin) {
    return MarkStatus.Unmarked
  }

  return MarkStatus.Marginal
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
    getMarkStatus(mark, { marginalMarkMin, validMarkMin }) ===
      MarkStatus.Marginal
  )
}

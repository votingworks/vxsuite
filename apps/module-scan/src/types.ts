import {
  BallotStyle,
  Contest,
  Precinct,
  MarkThresholds,
} from '@votingworks/ballot-encoder'
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

export type NonEmptyArray<T> = [T, ...T[]]

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

export interface ScanStatus {
  electionHash?: string
  batches: BatchInfo[]
  adjudication: AdjudicationStatus
}

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}

export interface AdjudicationStatus {
  adjudicated: number
  remaining: number
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
  markThresholds: MarkThresholds
): MarkStatus {
  if (mark.score >= markThresholds.definite) {
    return MarkStatus.Marked
  }

  if (mark.score < markThresholds.marginal) {
    return MarkStatus.Unmarked
  }

  return MarkStatus.Marginal
}

export function isMarginalMark(
  mark: BallotMark,
  markThresholds: MarkThresholds
): boolean {
  return (
    mark.type !== 'stray' &&
    getMarkStatus(mark, markThresholds) === MarkStatus.Marginal
  )
}

export function isNonEmptyArray<T>(array?: T[]): array is NonEmptyArray<T>
export function isNonEmptyArray<T>(
  array?: readonly T[]
): array is Readonly<NonEmptyArray<T>>
export function isNonEmptyArray<T>(
  array?: T[] | readonly T[]
): array is NonEmptyArray<T> | Readonly<NonEmptyArray<T>> {
  return array ? array.length > 0 : false
}

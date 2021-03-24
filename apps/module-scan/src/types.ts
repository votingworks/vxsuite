import {
  BallotStyle,
  Contest,
  Dictionary,
  MarkThresholds,
  Precinct,
} from '@votingworks/types'
import {
  BallotLocales,
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  BallotTargetMark,
} from '@votingworks/hmpb-interpreter'
import { MarkInfo, PageInterpretation } from './interpreter'
import { MarksByContestId, MarkStatus } from './types/ballot-review'

export type SheetOf<T> = [T, T]
export type Side = 'front' | 'back'

export interface PageInterpretationWithFiles {
  originalFilename: string
  normalizedFilename: string
  interpretation: PageInterpretation
}

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T
  contestIds?: readonly string[]
  adjudication?: MarksByContestId
}

export interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | [number, number] | BallotLocales
  > {
  _precinctId: string
  _ballotStyleId: string
  _ballotType: 'absentee' | 'provisional' | 'standard'
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
  _pageNumbers?: [number, number]
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
  error: string
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

export type BallotMetadata = Omit<BallotPageMetadata, 'pageNumber' | 'ballotId'>
export interface BallotPageQrcode {
  data: Uint8Array
  position: 'top' | 'bottom'
}

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

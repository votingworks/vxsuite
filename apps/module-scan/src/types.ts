import { BallotStyle, Precinct } from '@votingworks/ballot-encoder'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
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

export interface BallotInfo {
  id: number
  filename: string
  cvr?: CastVoteRecord
  marks?: MarkInfo
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

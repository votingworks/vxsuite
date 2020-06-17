import type { Election, OptionalElection } from '@votingworks/ballot-encoder'
import type { BallotMark, Size } from '@votingworks/hmpb-interpreter'

export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEvent = React.FormEvent<EventTarget>
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>
export type ButtonEventFunction = (event: ButtonEvent) => void

// Election
export type SetElection = (value: OptionalElection) => void

// Smart Card Content
export type CardDataTypes = 'voter' | 'pollworker' | 'clerk'
export interface CardData {
  readonly t: CardDataTypes
}
export interface VoterCardData extends CardData {
  readonly t: 'voter'
  readonly bs: string
  readonly pr: string
  readonly uz?: number
}
export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker'
  readonly h: string
}
export interface ClerkCardData extends CardData {
  readonly t: 'clerk'
  readonly h: string
}

// Scanner Types
export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean> {
  _precinctId: string
  _ballotStyleId: string
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
}

export interface OkResponse {
  status: 'ok'
}

export interface Batch {
  id: number
  count: number
  ballots: Ballot[]
  startedAt: number
  endedAt?: number
}

export interface Ballot {
  id: number
  filename: string
  cvr?: CastVoteRecord
  marks?: MarkInfo
}

export interface MarkInfo {
  marks: BallotMark[]
  ballotSize: Size
}

export interface ScanStatusResponse {
  electionHash?: string
  batches: Batch[]
}

export type GetConfigRequest = {}
export interface GetConfigResponse {
  election?: Election
  testMode: boolean
}

export interface PatchConfigRequest {
  election?: Election | null
  testMode?: boolean
}
export type PatchConfigResponse = OkResponse

export type CardReadRequest = {}
export type CardReadResponse =
  | { present: false }
  | { present: true; longValueExists: boolean; shortValue?: string }

export type CardReadLongRequest = {}
export interface CardReadLongResponse {
  longValue: string
}

import type {
  AdjudicationReason,
  Election,
  OptionalElection,
  VotesDict,
} from '@votingworks/ballot-encoder'
import type {
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  Size,
} from '@votingworks/hmpb-interpreter'
import { ElectionDefinition } from '../util/ballot-package'
import type { AdjudicationInfo } from './types/ballot-review'

export interface Dictionary<T> {
  [key: string]: T | undefined
}

export type DeepReadonly<T> = T extends (infer E)[]
  ? readonly DeepReadonly<E>[]
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T

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
  startedAt: string
  endedAt?: string
}

export interface AdjudicationStatus {
  adjudicated: number
  remaining: number
}

export type Ballot = BmdBallotInfo | HmpbBallotInfo | UnreadableBallotInfo

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

export type SerializableBallotPageLayout = Omit<
  BallotPageLayout,
  'ballotImage'
> & {
  ballotImage: Omit<BallotPageLayout['ballotImage'], 'imageData'>
}

export interface MarkInfo {
  marks: BallotMark[]
  ballotSize: Size
}

export interface ScanStatusResponse {
  electionHash?: string
  batches: Batch[]
  adjudication: AdjudicationStatus
}

export type GetConfigRequest = {}
export interface GetConfigResponse {
  election?: Election
  testMode: boolean
}

export interface PatchConfigRequest {
  election?: Election | ElectionDefinition | null
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

// eslint-disable-next-line import/no-cycle
export * from './types/ballot-review'

// these data structures live here until we can refactor the code
// to be more sheet-oriented and then place them where they belong.
interface ImageInfo {
  url: string
}

interface BallotPageInfo {
  image: ImageInfo
  interpretation: PageInterpretation
}

export interface BallotSheetInfo {
  id: string
  front: BallotPageInfo
  back: BallotPageInfo
}

export type BallotMetadata = Omit<BallotPageMetadata, 'pageNumber'>

export type PageInterpretation =
  | BlankPage
  | InterpretedBmdPage
  | InterpretedHmpbPage
  | InvalidTestModePage
  | UninterpretedHmpbPage
  | UnreadablePage

export interface BlankPage {
  type: 'BlankPage'
}

export interface InterpretedBmdPage {
  type: 'InterpretedBmdPage'
  ballotId: string
  metadata: BallotMetadata
  votes: VotesDict
}

export interface InterpretedHmpbPage {
  type: 'InterpretedHmpbPage'
  ballotId?: string
  metadata: BallotPageMetadata
  markInfo: MarkInfo
  votes: VotesDict
  adjudicationInfo: AdjudicationInfo
}

export interface InvalidTestModePage {
  type: 'InvalidTestModePage'
  metadata: BallotMetadata | BallotPageMetadata
}

export interface UninterpretedHmpbPage {
  type: 'UninterpretedHmpbPage'
  metadata: BallotPageMetadata
}

export interface UnreadablePage {
  type: 'UnreadablePage'
  reason?: string
}

export type AdjudicationReasonInfo =
  | UninterpretableBallotAdjudicationReasonInfo
  | MarginalMarkAdjudicationReasonInfo
  | OvervoteAdjudicationReasonInfo
  | UndervoteAdjudicationReasonInfo
  | WriteInAdjudicationReasonInfo
  | BlankBallotAdjudicationReasonInfo

export interface UninterpretableBallotAdjudicationReasonInfo {
  type: AdjudicationReason.UninterpretableBallot
}

export interface MarginalMarkAdjudicationReasonInfo {
  type: AdjudicationReason.MarginalMark
  contestId: string
  optionId: string
}

export interface OvervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Overvote
  contestId: string
  optionIds: readonly string[]
  expected: number
}

export interface UndervoteAdjudicationReasonInfo {
  type: AdjudicationReason.Undervote
  contestId: string
  optionIds: readonly string[]
  expected: number
}

export interface WriteInAdjudicationReasonInfo {
  type: AdjudicationReason.WriteIn
  contestId: string
  optionId: string
}

export interface BlankBallotAdjudicationReasonInfo {
  type: AdjudicationReason.BlankBallot
}

import { BallotPageLayout } from '@votingworks/hmpb-interpreter'
import { Dictionary, ElectionDefinition, MarkInfo } from '@votingworks/types'

export interface MachineConfig {
  machineId: string
}

export interface MachineConfigResponse {
  machineId: string
}

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void
export type InputEvent = React.FormEvent<EventTarget>
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>
export type ButtonEventFunction = (event: ButtonEvent) => void

// Election
export type SetElectionDefinition = (value?: ElectionDefinition) => void

// Scanner Types
export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean> {
  _precinctId: string
  _ballotStyleId: string
  _ballotType: 'absentee' | 'provisional' | 'standard'
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
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

import CastVoteRecordFiles from '../utils/CastVoteRecordFiles'

import { OptionalElection } from '@votingworks/ballot-encoder'
import { Candidate, Contest, VotesDict } from '@votingworks/ballot-encoder'

// Generic
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => void | Promise<void>
export type ButtonEventFunction = (
  event: React.MouseEvent<HTMLButtonElement>
) => void | Promise<void>

// Election
export type SaveElection = (value: OptionalElection) => void

// Router Props
export interface BallotScreenProps {
  ballotStyleId: string
  precinctId: string
  localeCode?: string
}
export interface PrecinctReportScreenProps {
  precinctId: string
}

// Tallies
export type ContestOption = Candidate | 'yes' | 'no'
export interface ContestOptionTally {
  option: ContestOption
  tally: number
}

export interface ContestTally {
  contest: Contest
  tallies: ContestOptionTally[]
}

export interface ElectionTally {
  precinctId: string | undefined
  contestTallies: ContestTally[]
}

export interface FullElectionTally {
  precinctTallies: Dictionary<ElectionTally>
  overallTally: ElectionTally
}

export type VotesByPrecinct = Dictionary<VotesDict[]>

// Cast Vote Record

export interface CastVoteRecord extends Dictionary<string | string[]> {
  _precinctId: string
  _ballotId: string
  _ballotStyleId: string
}

// Cast Vote Records
export interface CastVoteRecordFile {
  readonly name: string
  readonly count: number
  readonly precinctIds: readonly string[]
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>
export type SetCastVoteRecordFilesFunction = React.Dispatch<
  React.SetStateAction<CastVoteRecordFiles>
>

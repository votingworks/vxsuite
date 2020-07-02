import CastVoteRecordFiles from '../utils/CastVoteRecordFiles'

import {
  OptionalElection,
  BallotStyle,
  Precinct,
} from '@votingworks/ballot-encoder'
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

export interface BallotStyleData {
  ballotStyleId: BallotStyle['id']
  contestIds: Contest['id'][]
  precinctId: Precinct['id']
}

export interface BallotConfig extends BallotStyleData {
  filename: string
  locales: BallotLocale
  isLiveMode: boolean
}

export interface BallotLocale {
  primary: string
  secondary?: string
}

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

// Cast Vote Records

export type SaveCastVoteRecordFiles = (value?: CastVoteRecordFiles) => void

export interface CastVoteRecord extends Dictionary<string | string[]> {
  _precinctId: string
  _ballotId: string
  _ballotStyleId: string
}

export interface CastVoteRecordFile {
  readonly name: string
  readonly count: number
  readonly precinctIds: readonly string[]
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>
export type SetCastVoteRecordFilesFunction = React.Dispatch<
  React.SetStateAction<CastVoteRecordFiles>
>

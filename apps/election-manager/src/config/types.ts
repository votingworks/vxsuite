import {
  OptionalElection,
  BallotStyle,
  Precinct,
  Election,
} from '@votingworks/ballot-encoder'
import { Candidate, Contest, VotesDict } from '@votingworks/ballot-encoder'

// Generic
export declare type Optional<T> = T | undefined
export interface Dictionary<T> {
  [key: string]: Optional<T>
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
export interface ScannerReportScreenProps {
  scannerId: string
}

// Tallies
export interface YesNoContestOptionTally {
  option: ['yes'] | ['no'] | []
  tally: number
}
export type ContestOption = Candidate | ['yes'] | ['no'] | []
export interface ContestOptionTally {
  option: ContestOption
  tally: number
}

export interface ContestTally {
  contest: Contest
  tallies: ContestOptionTally[]
}

// TODO: separate into PrecinctTally and ScannerTally
export interface Tally {
  precinctId?: string
  scannerId?: string
  contestTallies: ContestTally[]
}

export interface FullElectionTally {
  scannerTallies: Dictionary<Tally>
  precinctTallies: Dictionary<Tally>
  overallTally: Tally
}

export type VotesByFilter = Dictionary<VotesDict[]>
export type VotesByFunction = (value: {
  election: Election
  castVoteRecords: CastVoteRecord[]
}) => VotesByFilter

// Cast Vote Records

export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean | number | BallotLocale> {
  _precinctId: string
  _ballotId: string
  _ballotStyleId: string
  _testBallot: boolean
  _scannerId: string
  _pageNumber?: number
  _locale?: BallotLocale
}

export interface CastVoteRecordFile {
  readonly name: string
  readonly count: number
  readonly precinctIds: readonly string[]
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>

export type VoteCounts = Dictionary<Dictionary<number>>
export type OptionalVoteCounts = Optional<Dictionary<Dictionary<number>>>

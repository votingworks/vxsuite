import {
  BallotStyle,
  Candidate,
  Contest,
  Election,
  Precinct,
} from '@votingworks/ballot-encoder'

// Generic
export declare type Optional<T> = T | undefined
export interface Dictionary<T> {
  [key: string]: Optional<T>
}

// Events
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => void | Promise<void>
export type TextareaEventFunction = (
  event: React.FormEvent<HTMLTextAreaElement>
) => void | Promise<void>
export type ButtonEventFunction = (
  event: React.MouseEvent<HTMLButtonElement>
) => void | Promise<void>

// Election
export type SaveElection = (electionJSON?: string) => void

export interface ElectionDefinition {
  election: Election
  electionData: string
  electionHash: string
}

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

export interface ContestTallyMeta {
  overvotes: number
  undervotes: number
  ballots: number
}
export type ContestTallyMetaDictionary = Dictionary<ContestTallyMeta>

export interface Tally {
  precinctId?: string
  scannerId?: string
  numberOfBallotsCounted: number
  castVoteRecords: Map<string, CastVoteRecord>
  contestTallies: ContestTally[]
  contestTallyMetadata: ContestTallyMetaDictionary
}

export enum TallyCategory {
  Precinct = 'precinct',
  Scanner = 'scanner',
}

export interface FullElectionTally {
  overallTally: Tally
  resultsByCategory: Map<TallyCategory, Dictionary<Tally>>
}

export type OptionalFullElectionTally = Optional<FullElectionTally>

// Cast Vote Records
export interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | number | number[] | BallotLocale
  > {
  _precinctId: string
  _ballotId: string
  _ballotStyleId: string
  _ballotType: 'absentee' | 'provisional' | 'standard'
  _testBallot: boolean
  _scannerId: string
  _pageNumber?: number
  _pageNumbers?: number[]
  _locales?: BallotLocale
}

export type CastVoteRecordFileMode = 'test' | 'live'

export type CastVoteRecordLists = ReadonlyArray<ReadonlyArray<CastVoteRecord>>

export interface CastVoteRecordFile {
  readonly name: string
  readonly count: number
  readonly scannerIds: readonly string[]
  readonly precinctIds: readonly string[]
  readonly exportTimestamp: Date
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>

export type VoteCounts = Dictionary<Dictionary<number>>
export type OptionalVoteCounts = Optional<Dictionary<Dictionary<number>>>

export type ISO8601Timestamp = string

export interface PrintedBallot {
  ballotStyleId: BallotStyle['id']
  precinctId: Precinct['id']
  locales: BallotLocale
  numCopies: number
  printedAt: ISO8601Timestamp
}

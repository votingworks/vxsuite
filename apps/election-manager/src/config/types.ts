import {
  BallotStyle,
  Candidate,
  Contest,
  Election,
  Precinct,
} from '@votingworks/types'

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
export interface PartyReportScreenProps {
  partyId: string
}

// Tallies
export type YesNoOption = ['yes'] | ['no'] | []
export type ContestOption = Candidate | YesNoOption
export interface YesNoContestOptionTally {
  readonly option: YesNoOption
  readonly tally: number
}
export interface ContestOptionTally {
  readonly option: ContestOption
  readonly tally: number
}

export interface ContestTally {
  readonly contest: Contest
  readonly tallies: Dictionary<ContestOptionTally>
  readonly metadata: ContestTallyMeta
}

export interface ContestTallyMeta {
  readonly overvotes: number
  readonly undervotes: number
  readonly ballots: number
}
export type ContestTallyMetaDictionary = Dictionary<ContestTallyMeta>

export interface Tally {
  readonly numberOfBallotsCounted: number
  // TODO(#2975): Once we're removing duplicate ballots, make this a dictionary indexed by ballotId
  readonly castVoteRecords: readonly CastVoteRecord[]
  readonly contestTallies: Dictionary<ContestTally>
}

export enum TallyCategory {
  Precinct = 'precinct',
  Scanner = 'scanner',
  Party = 'party',
  VotingMethod = 'votingmethod',
}

export interface FullElectionTally {
  readonly overallTally: Tally
  readonly resultsByCategory: ReadonlyMap<TallyCategory, Dictionary<Tally>>
}

export interface ExternalTally {
  readonly contestTallies: Dictionary<ContestTally>
  readonly numberOfBallotsCounted: number
}

export interface FullElectionExternalTally {
  readonly overallTally: ExternalTally
  readonly resultsByCategory: ReadonlyMap<
    TallyCategory,
    Dictionary<ExternalTally>
  >
}

export type OptionalExternalTally = Optional<ExternalTally>
export type OptionalFullElectionTally = Optional<FullElectionTally>
export type OptionalFullElectionExternalTally = Optional<FullElectionExternalTally>

export enum ResultsFileType {
  CastVoteRecord = 'cvr',
  SEMS = 'sems',
}

export type OptionalFile = Optional<File>

// provisional ballot types are not yet supported.
export enum VotingMethod {
  Absentee = 'absentee',
  Precinct = 'standard',
  Unknown = 'unknown',
}

// Cast Vote Records
export interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | number | number[] | BallotLocale
  > {
  readonly _precinctId: string
  readonly _ballotId: string
  readonly _ballotStyleId: string
  readonly _ballotType: 'absentee' | 'provisional' | 'standard'
  readonly _testBallot: boolean
  readonly _scannerId: string
  readonly _pageNumber?: number
  readonly _pageNumbers?: number[]
  readonly _locales?: BallotLocale
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

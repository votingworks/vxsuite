import {
  BallotStyle,
  Candidate,
  Contest,
  Dictionary,
  Optional,
  Precinct,
} from '@votingworks/types'

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void
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
export type SaveElection = (electionJSON?: string) => Promise<void>

export interface BallotStyleData {
  ballotStyleId: BallotStyle['id']
  contestIds: Contest['id'][]
  precinctId: Precinct['id']
}

export interface BallotConfig extends BallotStyleData {
  filename: string
  locales: BallotLocale
  isLiveMode: boolean
  isAbsentee: boolean
}

export interface BallotLocale {
  primary: string
  secondary?: string
}

export const PrintableBallotType = {
  Absentee: 'absentee',
  Precinct: 'standard',
} as const
export type PrintableBallotType = typeof PrintableBallotType[keyof typeof PrintableBallotType]

export interface PrintedBallot {
  ballotStyleId: BallotStyle['id']
  precinctId: Precinct['id']
  locales: BallotLocale
  numCopies: number
  printedAt: ISO8601Timestamp
  type: PrintableBallotType
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
export interface VotingMethodReportScreenProps {
  votingMethod: string
}
export interface ManualDataPrecinctScreenProps {
  precinctId: string
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
  readonly castVoteRecords: Set<CastVoteRecord>
  readonly contestTallies: Dictionary<ContestTally>
  readonly ballotCountsByVotingMethod: Dictionary<number>
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

export enum ExternalTallySourceType {
  SEMS = 'sems',
  Manual = 'manual-data',
}

export interface FullElectionExternalTally {
  readonly overallTally: ExternalTally
  readonly resultsByCategory: ReadonlyMap<
    TallyCategory,
    Dictionary<ExternalTally>
  >
  readonly votingMethod: VotingMethod
  readonly source: ExternalTallySourceType
  readonly inputSourceName: string
  readonly timestampCreated: Date
}

export interface ExportableContestTally {
  readonly tallies: Dictionary<number>
  readonly metadata: ContestTallyMeta
}
export type ExportableTally = Dictionary<ExportableContestTally>
export interface ExportableTallies {
  readonly talliesByPrecinct: Dictionary<ExportableTally>
}

export interface ExternalFileConfiguration {
  readonly file: File
  readonly votingMethod: VotingMethod
}

export type OptionalExternalTally = Optional<ExternalTally>
export type OptionalFullElectionTally = Optional<FullElectionTally>
export type OptionalFullElectionExternalTally = Optional<FullElectionExternalTally>

export enum ResultsFileType {
  CastVoteRecord = 'cvr',
  SEMS = 'sems',
  All = 'all',
  Manual = 'manual',
}
export type OptionalFile = Optional<File>

// provisional ballot types are not yet supported.
export const VotingMethod = {
  ...PrintableBallotType,
  Unknown: 'unknown',
} as const
export type VotingMethod = typeof VotingMethod[keyof typeof VotingMethod]

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

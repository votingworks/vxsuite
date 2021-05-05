export type TallyCount = number
export interface CandidateVoteTally {
  candidates: TallyCount[]
  writeIns: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export interface YesNoVoteTally {
  yes: TallyCount
  no: TallyCount
  undervotes: TallyCount
  overvotes: TallyCount
  ballotsCast: TallyCount
}
export interface MsEitherNeitherTally {
  ballotsCast: TallyCount
  eitherOption: TallyCount
  neitherOption: TallyCount
  eitherNeitherUndervotes: TallyCount
  eitherNeitherOvervotes: TallyCount
  firstOption: TallyCount
  secondOption: TallyCount
  pickOneUndervotes: TallyCount
  pickOneOvervotes: TallyCount
}

export type Tally = (
  | CandidateVoteTally
  | YesNoVoteTally
  | MsEitherNeitherTally
)[]

export enum TallySourceMachineType {
  BMD = 'bmd',
  PRECINCT_SCANNER = 'precinct_scanner',
}

export interface CardTallyMetadataEntry {
  readonly machineId: string
  readonly timeSaved: number
  readonly ballotCount: number
}

export interface CardTally {
  readonly tallyMachineType: TallySourceMachineType
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
}

export interface BMDCardTally {
  readonly tallyMachineType: TallySourceMachineType.BMD
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsPrinted: number
}

export interface PrecinctScannerCardTally {
  readonly tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsScanned: number
  readonly isLiveMode: boolean
}

import {
  BallotStyle,
  CandidateContest,
  CandidateVote,
  Contests,
  ElectionDefinition,
  MsEitherNeitherContest,
  OptionalVote,
  OptionalYesNoVote,
  Parties,
  Precinct,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/types'
import { Printer } from '../utils/printer'

// App
export const VxPrintOnly = {
  name: 'VxPrint',
  isVxMark: false,
  isVxPrint: true,
} as const
export const VxMarkOnly = {
  name: 'VxMark',
  isVxMark: true,
  isVxPrint: false,
} as const
export const VxMarkPlusVxPrint = {
  name: 'VxMark + VxPrint',
  isVxPrint: true,
  isVxMark: true,
} as const
export type AppMode =
  | typeof VxMarkOnly
  | typeof VxPrintOnly
  | typeof VxMarkPlusVxPrint
export type AppModeNames = AppMode['name']

export interface MachineConfig {
  machineId: string
  appMode: AppMode
  codeVersion: string
}

export interface MachineConfigResponse {
  machineId: string
  appModeName: AppModeNames
  codeVersion: string
}

export function getAppMode(name: AppModeNames): AppMode {
  switch (name) {
    case VxPrintOnly.name:
      return VxPrintOnly
    case VxMarkOnly.name:
      return VxMarkOnly
    case VxMarkPlusVxPrint.name:
      return VxMarkPlusVxPrint
    default:
      throw new Error(`unknown app mode: ${name}`)
  }
}

export type PostVotingInstructions = 'card' | 'cardless'

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void
export type InputChangeEventFunction = React.ChangeEventHandler<HTMLInputElement>
export type TextareaChangeEventFunction = React.ChangeEventHandler<HTMLTextAreaElement>
export type SelectChangeEventFunction = React.ChangeEventHandler<HTMLSelectElement>

// Election
export interface ActivationData {
  ballotStyle: BallotStyle
  precinct: Precinct
}

export interface SerializableActivationData {
  ballotStyleId: string
  isCardlessVoter: boolean
  precinctId: string
}

// Votes
export type YesOrNo = Exclude<YesNoVote[0] | YesNoVote[1], undefined>
export type TallyCount = number
export interface CandidateVoteTally {
  candidates: TallyCount[]
  writeIns: TallyCount
  undervotes: TallyCount
  ballotsCast: TallyCount
}
export interface YesNoVoteTally {
  yes: TallyCount
  no: TallyCount
  undervotes: TallyCount
  ballotsCast: TallyCount
}
export interface MsEitherNeitherTally {
  ballotsCast: TallyCount
  eitherOption: TallyCount
  neitherOption: TallyCount
  eitherNeitherUndervotes: TallyCount
  firstOption: TallyCount
  secondOption: TallyCount
  pickOneUndervotes: TallyCount
}
export type Tally = (
  | CandidateVoteTally
  | YesNoVoteTally
  | MsEitherNeitherTally
)[]

export interface CardTallyMetadataEntry {
  readonly machineId: string
  readonly timeSaved: number
  readonly ballotsPrinted: number
}

export interface CardTally {
  readonly tally: Tally
  readonly metadata: readonly CardTallyMetadataEntry[]
  readonly totalBallotsPrinted: number
}

// Ballot
export type UpdateVoteFunction = (contestId: string, vote: OptionalVote) => void
export type MarkVoterCardFunction = () => Promise<boolean>
export interface BallotContextInterface {
  machineConfig: MachineConfig
  ballotStyleId: string
  contests: Contests
  readonly electionDefinition: ElectionDefinition
  isCardlessVoter: boolean
  isLiveMode: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  markVoterCardVoided: MarkVoterCardFunction
  precinctId: string
  printer: Printer
  resetBallot: (instructions?: PostVotingInstructions) => void
  setUserSettings: SetUserSettings
  updateTally: () => void
  updateVote: UpdateVoteFunction
  forceSaveVote: () => void
  userSettings: UserSettings
  votes: VotesDict
}

// Review and Printed Ballot
export interface CandidateContestResultInterface {
  contest: CandidateContest
  parties: Parties
  vote: CandidateVote
}
export interface YesNoContestResultInterface {
  contest: YesNoContest
  vote: OptionalYesNoVote
}
export interface MsEitherNeitherContestResultInterface {
  contest: MsEitherNeitherContest
  eitherNeitherContestVote: OptionalYesNoVote
  pickOneContestVote: OptionalYesNoVote
}

// Smart Card Content
export type CardDataTypes = 'voter' | 'pollworker' | 'admin'
export interface VoterCardData {
  readonly t: 'voter'
  readonly c: number // created date
  readonly bs: string // ballot style id
  readonly pr: string // precinct id
  readonly uz?: number // used (voided)
  readonly bp?: number // ballot printed date
  readonly u?: number // updated date
  readonly m?: string // mark machine id
}
export interface PollworkerCardData {
  readonly t: 'pollworker'
  readonly h: string
}
export interface AdminCardData {
  readonly t: 'admin'
  readonly h: string
}
export type CardData = VoterCardData | PollworkerCardData | AdminCardData

export interface CardAbsentAPI {
  present: false
}
export interface CardPresentAPI {
  present: true
  shortValue?: string
  longValueExists?: boolean
}
export type CardAPI = CardAbsentAPI | CardPresentAPI

// User Interface
export type ScrollDirections = 'up' | 'down'
export interface ScrollShadows {
  showBottomShadow: boolean
  showTopShadow: boolean
}
export interface Scrollable {
  isScrollable: boolean
}

export type TextSizeSetting = 0 | 1 | 2 | 3

export interface UserSettings {
  textSize: TextSizeSetting
}
export type SetUserSettings = (partial: PartialUserSettings) => void
export type PartialUserSettings = Partial<UserSettings>

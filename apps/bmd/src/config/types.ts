import { Candidate, Contest } from '@votingworks/ballot-encoder'
import { Printer } from '../utils/printer'

// Generic
export type VoidFunction = () => void
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// App
export type AppModeNames = 'VxMark' | 'VxPrint' | 'VxMark + VxPrint'
export interface AppMode {
  readonly name: AppModeNames
  readonly isVxPrint?: boolean
  readonly isVxMark?: boolean
}
export const VxPrintOnly: AppMode = { name: 'VxPrint', isVxPrint: true }
export const VxMarkOnly: AppMode = { name: 'VxMark', isVxMark: true }
export const VxMarkPlusVxPrint: AppMode = {
  name: 'VxMark + VxPrint',
  isVxPrint: true,
  isVxMark: true,
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

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void

// Contests
export interface CandidateContest extends Contest {
  readonly type: 'candidate'
  readonly seats: number
  readonly candidates: Candidate[]
  readonly allowWriteIns: boolean
}
export interface YesNoContest extends Contest {
  readonly type: 'yesno'
  readonly description: string
  readonly shortTitle: string
}
export type Contests = (CandidateContest | YesNoContest)[]

// Election
export interface BallotStyle {
  readonly id: string
  readonly precincts: string[]
  readonly districts: string[]
  readonly partyId?: string
}
export interface Party {
  readonly id: string
  readonly name: string
  readonly abbrev: string
}
export type Parties = Party[]
export interface Precinct {
  readonly id: string
  readonly name: string
}
export interface District {
  readonly id: string
  readonly name: string
}
export interface County {
  readonly id: string
  readonly name: string
}

export interface Election {
  readonly ballotStyles: BallotStyle[]
  readonly county: County
  readonly parties: Parties
  readonly precincts: Precinct[]
  readonly districts: District[]
  readonly contests: Contests
  readonly date: string
  readonly seal?: string
  readonly sealURL?: string
  readonly state: string
  readonly title: string
}
export type OptionalElection = Election | undefined

export interface ActivationData {
  ballotCreatedAt: number
  ballotStyle: BallotStyle
  precinct: Precinct
}

// Votes
export type CandidateVote = Candidate[]
export type YesNoVote = 'yes' | 'no'
export type OptionalYesNoVote = YesNoVote | undefined
export type Vote = CandidateVote | YesNoVote
export type OptionalVote = Vote | undefined
export type VotesDict = Dictionary<Vote>

export interface WriteInCandidateTally {
  name: string
  tally: number
}
export type TallyCount = number
export interface CandidateVoteTally {
  candidates: TallyCount[]
  writeIns: WriteInCandidateTally[]
}
export interface YesNoVoteTally {
  yes: TallyCount
  no: TallyCount
}
export type Tally = (CandidateVoteTally | YesNoVoteTally)[]

// Ballot
export type UpdateVoteFunction = (contestId: string, vote: OptionalVote) => void
export type MarkVoterCardFunction = () => Promise<boolean>
export interface BallotContextInterface {
  activateBallot: (activationData: ActivationData) => void
  appMode: AppMode
  ballotStyleId: string
  contests: Contests
  readonly election: Election
  isLiveMode: boolean
  markVoterCardPrinted: MarkVoterCardFunction
  markVoterCardVoided: MarkVoterCardFunction
  precinctId: string
  printer: Printer
  resetBallot: (path?: string) => void
  setUserSettings: SetUserSettings
  updateTally: () => void
  updateVote: UpdateVoteFunction
  userSettings: UserSettings
  votes: VotesDict
}

// Smart Card Content
export type CardDataTypes = 'voter' | 'pollworker' | 'clerk'
export interface CardData {
  readonly t: CardDataTypes
}
export interface VoterCardData extends CardData {
  readonly t: 'voter'
  readonly c: number // created date
  readonly bs: string // ballot style id
  readonly pr: string // precinct id
  readonly uz?: number // used (voided)
  readonly bp?: number // ballot printed date
  readonly u?: number // updated date
  readonly m?: string // mark machine id
}
export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker'
  readonly h: string
}
export interface ClerkCardData extends CardData {
  readonly t: 'clerk'
  readonly h: string
}

export interface CardAbsentAPI {
  present: false
}
export interface CardPresentAPI {
  present: true
  shortValue: string
  longValueExists?: boolean
}
export type CardAPI = CardAbsentAPI | CardPresentAPI

// Machine ID API
export interface MachineIdAPI {
  machineId: string
}

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

export default {}

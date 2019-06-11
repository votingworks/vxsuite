// Generic
export type VoidFunction = () => void
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEvent = React.FormEvent<EventTarget>

// Candidates
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly partyId?: string
  isWriteIn?: boolean
}
export type OptionalCandidate = Candidate | undefined

// Contests
export type ContestTypes = 'candidate' | 'yesno'
export interface Contest {
  readonly id: string
  readonly districtId: string
  readonly partyId?: string
  readonly section: string
  readonly title: string
  readonly type: ContestTypes
}
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
export interface BMDConfig {
  readonly requireActivation?: boolean
  readonly showHelpPage?: boolean
  readonly showSettingsPage?: boolean
}
export interface ElectionDefaults {
  readonly bmdConfig: BMDConfig
}
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
  readonly bmdConfig?: BMDConfig
}
export type OptionalElection = Election | undefined

export interface ActivationData {
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

// Ballot
export type UpdateVoteFunction = (contestId: string, vote: OptionalVote) => void
export type MarkVoterCardUsedFunction = (props: {
  ballotPrinted: boolean
}) => Promise<boolean>
export interface BallotContextInterface {
  activateBallot: (activationData: ActivationData) => void
  ballotStyleId: string
  contests: Contests
  readonly election: Election | undefined
  incrementBallotsPrintedCount: () => void
  isLiveMode: boolean
  markVoterCardUsed: MarkVoterCardUsedFunction
  precinctId: string
  resetBallot: (path?: string) => void
  setUserSettings: (partial: PartialUserSettings) => void
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
  readonly bs: string
  readonly pr: string
  readonly uz?: number
  readonly bp?: number
}
export interface PollworkerCardData extends CardData {
  readonly t: 'pollworker'
  readonly h: string
}
export interface ClerkCardData extends CardData {
  readonly t: 'clerk'
  readonly h: string
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
export type PartialUserSettings = Partial<UserSettings>

export default {}

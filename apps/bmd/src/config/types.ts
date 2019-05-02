// Generic
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEvent = React.FormEvent<EventTarget>
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>

// UI
export type ScrollDirections = 'up' | 'down'
export interface ScrollShadows {
  showBottomShadow: boolean
  showTopShadow: boolean
}
export interface Scrollable {
  isScrollable: boolean
}

// Election
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly party?: string
  isWriteIn?: boolean
}
export type OptionalCandidate = Candidate | undefined

// Votes
export type CandidateVote = Candidate[]
export type YesNoVote = 'yes' | 'no'
export type OptionalYesNoVote = YesNoVote | undefined
export type Vote = CandidateVote | YesNoVote
export type OptionalVote = Vote | undefined
export type VotesDict = Dictionary<Vote>

// Contests
export type ContestTypes = 'candidate' | 'yesno'
export interface Contest {
  readonly id: string
  readonly districtId: string
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
export type Contests = Array<CandidateContest | YesNoContest>

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
}
export interface Precinct {
  readonly id: string
  readonly name: string
}
export interface District {
  readonly id: string
  readonly name: string
}
export interface Election {
  readonly ballotStyles: BallotStyle[]
  readonly precincts: Precinct[]
  readonly districts: District[]
  readonly contests: Contests
  readonly county: string
  readonly date: string
  readonly seal: string
  readonly state: string
  readonly title: string
  readonly bmdConfig?: BMDConfig
}
export type OptionalElection = Election | undefined

export interface ActivationData {
  ballotStyle: BallotStyle
  precinct: Precinct
}

export type TextSizeSetting = 0 | 1 | 2 | 3

export interface UserSettings {
  textSize: TextSizeSetting
}
export type PartialUserSettings = Partial<UserSettings>

// Ballot
export type UpdateVoteFunction = (contestId: string, vote: OptionalVote) => void
export interface BallotContextInterface {
  contests: Contests
  readonly election: Election | undefined
  resetBallot: (path?: string) => void
  activateBallot: (activationData: ActivationData) => void
  updateVote: UpdateVoteFunction
  votes: VotesDict
  precinctId: string
  ballotStyleId: string
  setUserSettings: (partial: PartialUserSettings) => void
  userSettings: UserSettings
}

export default {}

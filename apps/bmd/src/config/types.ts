import React from 'react'

// Generic
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEvent = React.FormEvent<EventTarget>
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>

// Election
export interface Candidate {
  readonly id: string
  readonly name: string
  readonly party?: string
  isWriteIn?: boolean
}
export type OptionalCandidate = Candidate | undefined
export type Vote = Candidate[] // will eventually add "| Approval" to this type
export type OptionalVote = Candidate[] | undefined
export type VotesDict = Dictionary<Vote>
export interface Contest {
  readonly id: string
  readonly section?: string
  readonly title: string
  readonly type: string
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
}
export interface BMDConfig {
  readonly requireActivation?: boolean
  readonly showHelpPage?: boolean
  readonly showSettingsPage?: boolean
}
export interface ElectionDefaults {
  readonly bmdConfig: BMDConfig
}
export interface Election {
  readonly contests: Array<CandidateContest | YesNoContest>
  readonly county: string
  readonly date: string
  readonly seal: string
  readonly state: string
  readonly title: string
  readonly bmdConfig?: BMDConfig
}
export type OptionalElection = Election | undefined
export type UpdateVoteFunction = (contestId: string, vote: Vote) => void
export interface BallotContextInterface {
  readonly election: Election | undefined
  resetBallot: () => void
  setBallotKey: (activationCode: string) => void
  updateVote: UpdateVoteFunction
  votes: VotesDict
}

export default {}

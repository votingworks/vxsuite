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
}
export type OptionalCandidate = Candidate | undefined
export type VoteDict = Dictionary<OptionalCandidate>
export interface Contest {
  readonly id: string
  readonly title: string
  readonly section?: string
  readonly type: string // TODO: convert to enum: VotingMethod { 'plurality' | 'approval' }
  readonly candidates: Candidate[]
}
export interface Election {
  readonly contests: Contest[]
  readonly county: string
  readonly date: string
  readonly seal: string
  readonly state: string
  readonly title: string
}
export type OptionalElection = Election | undefined
export type UpdateVoteFunction = (
  contestId: string,
  candidate: OptionalCandidate
) => void
export interface BallotContextInterface {
  readonly election: Election | undefined
  resetBallot: () => void
  setBallotKey: (activationCode: string) => void
  updateVote: UpdateVoteFunction
  votes: VoteDict
}

export default {}

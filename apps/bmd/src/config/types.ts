import React from 'react'

// Generic
export interface Dictionary<T> {
  [key: string]: T | undefined
}

// Events
export type InputEvent = React.FormEvent<EventTarget>
export type ButtonEvent = React.MouseEvent<HTMLButtonElement>

// Election
export type Vote = string | string[] | undefined
export type VoteDict = Dictionary<Vote>
export interface Candidate {
  readonly id: string
  readonly name: string
}
export interface Contest {
  readonly id: string
  readonly title: string
  readonly type: string // TODO: convert to enum: VotingMethod { 'plurality' | 'approval' }
  readonly candidates: Candidate[]
}
export interface Election {
  readonly contests: Contest[]
}
export type OptionalElection = Election | undefined
export type UpdateVoteFunction = (contestId: string, vote: Vote) => void
export interface BallotContextInterface {
  readonly contests: Contest[]
  resetBallot: () => void
  updateVote: UpdateVoteFunction
  votes: VoteDict
}

export default {}

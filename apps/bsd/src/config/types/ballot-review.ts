import * as t from '@votingworks/ballot-encoder'
import { Rect } from '@votingworks/hmpb-interpreter'
import { OkResponse } from '../types'

type ContestId = t.Contest['id']

export type GetBallotRequest = {}
export type GetBallotResponse = ReviewBallot

export interface PutBallotRequest {
  contests: MarksByContestId
}

export interface PerContestAndOption<T> {
  [key: string]: PerOption<T> | undefined
}

export interface PerOption<T> {
  [key: string]: T | undefined
}

export type PutBallotResponse = OkResponse



export interface ContestLayout {
  bounds: Rect
  options: readonly ContestOptionLayout[]
}

export interface ContestOptionLayout {
  bounds: Rect
}

export type MarksByContestId = PerContestAndOption<MarkStatus>
export type MarksByOptionId = PerOption<MarkStatus>

export enum MarkStatus {
  Marked = 'marked',
  Unmarked = 'unmarked',
  Marginal = 'marginal',
}

export type ReviewBallot =
  | ReviewMarginalMarksBallot
  | ReviewUninterpretableHmpbBallot

export interface BallotInfo {
  url: string
  image: { url: string; width: number; height: number }
}

export interface ReviewMarginalMarksBallot {
  type: 'ReviewMarginalMarksBallot'
  ballot: BallotInfo
  contests: readonly Contest[]
  layout: readonly ContestLayout[]
  marks: MarksByContestId
}

export interface ReviewUninterpretableHmpbBallot {
  type: 'ReviewUninterpretableHmpbBallot'
  ballot: BallotInfo
  contests: readonly Contest[]
}

export interface Contest {
  id: ContestId
  title: string
  bounds: Rect
  options: readonly ContestOption[]
}

export type ContestOption = CandidateContestOption | YesNoContestOption

export interface CandidateContestOption {
  type: t.CandidateContest['type']
  id: t.CandidateContest['id']
  name: t.Candidate['name']
  bounds: Rect
}

export interface YesNoContestOption {
  type: t.YesNoContest['type']
  id: Exclude<t.YesNoVote[0] | t.YesNoVote[1], undefined>
  name: string
  bounds: Rect
}

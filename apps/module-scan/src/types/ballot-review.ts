import * as t from '@votingworks/ballot-encoder'
import { Rect } from '@votingworks/hmpb-interpreter'

type ContestId = t.Contest['id']

export interface MarksByContestId {
  [key: string]: MarksByOptionId | undefined
}

export interface MarksByOptionId {
  [key: string]: MarkStatus | undefined
}

export interface ContestLayout {
  bounds: Rect
  options: readonly ContestOptionLayout[]
}

export interface ContestOptionLayout {
  bounds: Rect
}

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
  options: readonly ContestOption[]
}

export type ContestOption = CandidateContestOption | YesNoContestOption

export interface CandidateContestOption {
  type: t.CandidateContest['type']
  id: t.CandidateContest['id']
  name: t.Candidate['name']
}

export interface YesNoContestOption {
  type: t.YesNoContest['type']
  id: Exclude<t.YesNoVote[0] | t.YesNoVote[1], undefined>
  name: string
}

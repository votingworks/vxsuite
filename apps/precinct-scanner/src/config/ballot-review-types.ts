import * as t from '@votingworks/types'
import type { Point, Rect } from '@votingworks/hmpb-interpreter'
import { AdjudicationReasonInfo } from './types'

type ContestId = t.Contest['id']

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetBallotRequest = {}
export type GetBallotResponse = ReviewBallot

export interface PutBallotRequest {
  contests: MarksByContestId
}

export interface MarksByContestId {
  [key: string]: MarksByOptionId | undefined
}

export interface MarksByOptionId {
  [key: string]: MarkStatus | undefined
}

export type PutBallotResponse = t.OkAPIResponse

export interface ContestLayout {
  bounds: Rect
  corners: readonly [Point, Point, Point, Point]
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
  id: string
  url: string
  image: { url: string; width: number; height: number }
}

export interface AdjudicationInfo {
  requiresAdjudication: boolean
  enabledReasons: readonly t.AdjudicationReason[]
  allReasonInfos: readonly AdjudicationReasonInfo[]
}

export interface ReviewMarginalMarksBallot {
  type: 'ReviewMarginalMarksBallot'
  ballot: BallotInfo
  contests: readonly Contest[]
  layout: readonly ContestLayout[]
  marks: MarksByContestId
  adjudicationInfo: AdjudicationInfo
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
  isWriteIn: boolean
}

export interface YesNoContestOption {
  type: t.YesNoContest['type']
  id: Exclude<t.YesNoVote[0] | t.YesNoVote[1], undefined>
  name: string
  bounds: Rect
}

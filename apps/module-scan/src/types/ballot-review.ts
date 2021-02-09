import * as t from '@votingworks/types'
import { Rect } from '@votingworks/hmpb-interpreter'
import { AdjudicationReasonInfo } from '../util/ballotAdjudicationReasons'

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
  options: readonly ContestOption[]
}

export type ContestOption =
  | CandidateContestOption
  | YesNoContestOption
  | MsEitherNeitherContestOption

export interface CandidateContestOption {
  type: t.CandidateContest['type']
  id: t.Candidate['id']
  contestId: t.CandidateContest['id']
  name: t.Candidate['name']
  isWriteIn: boolean
}

export interface YesNoContestOption {
  type: t.YesNoContest['type']
  id: Exclude<t.YesNoVote[0] | t.YesNoVote[1], undefined>
  contestId: t.YesNoContest['id']
  name: string
}

export interface MsEitherNeitherContestOption {
  type: t.MsEitherNeitherContest['type']
  id:
    | t.MsEitherNeitherContest['eitherOption']['id']
    | t.MsEitherNeitherContest['neitherOption']['id']
    | t.MsEitherNeitherContest['firstOption']['id']
    | t.MsEitherNeitherContest['secondOption']['id']
  contestId:
    | t.MsEitherNeitherContest['eitherNeitherContestId']
    | t.MsEitherNeitherContest['pickOneContestId']
  name: string
}

import * as t from '@votingworks/ballot-encoder'
import { Rect } from '@votingworks/hmpb-interpreter'
import { OkResponse } from '../types'

type ContestId = t.Contest['id']

export type GetBallotRequest = {}
export type GetBallotResponse = ReviewBallot

export interface PutBallotRequest {
  contests: MarksByContestId
}
export type PutBallotResponse = OkResponse

export interface MarksByContestId {
  [key: string]: MarksByOptionId | undefined
}

export interface MarksByOptionId {
  [key: string]: boolean | undefined
}

export interface ReviewBallot {
  ballot: {
    url: string
    image: { url: string; width: number; height: number }
  }
  contests: readonly Contest[]
  marks: MarksByContestId
}

export interface Contest {
  id: ContestId
  title: string
  bounds: Rect
  options: readonly ContestOption[]
}

export type ContestOption =
  | CandidateContestOption
  | YesNoContestOption

export interface CandidateContestOption {
  type: t.CandidateContest['type']
  id: t.CandidateContest['id']
  name: t.Candidate['name']
  bounds: Rect
}

export interface YesNoContestOption {
  type: t.YesNoContest['type']
  id: t.YesNoVote
  name: t.YesNoVote
  bounds: Rect
}

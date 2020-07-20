import * as t from '@votingworks/ballot-encoder'
import { Rect } from '@votingworks/hmpb-interpreter'

type ContestId = t.Contest['id']

export interface MarksByContestId {
  [key: string]: MarksByOptionId | undefined
}

export interface MarksByOptionId {
  [key: string]: MarkStatus | undefined
}

export enum MarkStatus {
  Marked = 'marked',
  Unmarked = 'unmarked',
  Marginal = 'marginal',
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

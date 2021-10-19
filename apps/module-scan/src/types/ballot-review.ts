import * as t from '@votingworks/types';
import { AdjudicationInfo, MarksByContestId, Rect } from '@votingworks/types';

type ContestId = t.Contest['id'];

export interface ContestLayout {
  bounds: Rect;
  options: readonly ContestOptionLayout[];
}

export interface ContestOptionLayout {
  bounds: Rect;
}

export type ReviewBallot =
  | ReviewMarginalMarksBallot
  | ReviewUninterpretableHmpbBallot;

export interface BallotInfo {
  id: string;
  url: string;
  image: { url: string; width: number; height: number };
}

export interface ReviewMarginalMarksBallot {
  type: 'ReviewMarginalMarksBallot';
  ballot: BallotInfo;
  contests: readonly Contest[];
  layout: readonly ContestLayout[];
  marks: MarksByContestId;
  adjudicationInfo: AdjudicationInfo;
}

export interface ReviewUninterpretableHmpbBallot {
  type: 'ReviewUninterpretableHmpbBallot';
  ballot: BallotInfo;
  contests: readonly Contest[];
}

export interface Contest {
  id: ContestId;
  title: string;
  options: readonly t.ContestOption[];
}

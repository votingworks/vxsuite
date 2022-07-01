import {
  BallotId,
  BallotLocale,
  BallotStyleId,
  InlineBallotImage,
  PrecinctId,
} from './election';
import { BallotPageLayout } from './hmpb';
import { Dictionary } from './generic';

export interface CastVoteRecord
  extends Dictionary<
    | string
    | string[]
    | boolean
    | number
    | number[]
    | BallotLocale
    | InlineBallotImage[]
    | Array<BallotPageLayout[]>
  > {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotImages?: InlineBallotImage[];
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: 'absentee' | 'provisional' | 'standard';
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: number[];
  readonly _layouts?: Array<BallotPageLayout[]>;
  readonly _locales?: BallotLocale;
}

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
    | readonly string[]
    | boolean
    | number
    | readonly number[]
    | BallotLocale
    | readonly [InlineBallotImage, InlineBallotImage]
    | readonly [BallotPageLayout, BallotPageLayout]
  > {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotImages?: readonly [InlineBallotImage, InlineBallotImage];
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: 'absentee' | 'provisional' | 'standard';
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: readonly [number, number];
  readonly _layouts?: readonly [BallotPageLayout, BallotPageLayout];
  readonly _locales?: BallotLocale;
}

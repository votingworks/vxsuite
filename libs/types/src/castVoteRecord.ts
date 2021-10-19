import { BallotLocale } from './election';
import { Dictionary } from './generic';

export interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | number | number[] | BallotLocale
  > {
  readonly _precinctId: string;
  readonly _ballotId: string;
  readonly _ballotStyleId: string;
  readonly _ballotType: 'absentee' | 'provisional' | 'standard';
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: number[];
  readonly _locales?: BallotLocale;
}

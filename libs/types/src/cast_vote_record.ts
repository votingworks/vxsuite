import {
  BallotId,
  BallotLocale,
  BallotStyleId,
  InlineBallotImage,
  PrecinctId,
} from './election';
import { BallotPageLayout, SheetOf } from './hmpb';
import { Dictionary } from './generic';

export interface CastVoteRecord
  extends Dictionary<
    | string
    | readonly string[]
    | boolean
    | number
    | readonly number[]
    | BallotLocale
    | SheetOf<InlineBallotImage>
    | SheetOf<BallotPageLayout>
  > {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotImages?: SheetOf<InlineBallotImage>;
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: 'absentee' | 'provisional' | 'standard';
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: SheetOf<number>;
  readonly _layouts?: SheetOf<BallotPageLayout>;
  readonly _locales?: BallotLocale;
}

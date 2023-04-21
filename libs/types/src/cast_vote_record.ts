import {
  BallotId,
  BallotLocale,
  BallotStyleId,
  InlineBallotImage,
  PrecinctId,
} from './election';
import { BallotPageLayout, SheetOf } from './hmpb';
import { Dictionary } from './generic';

export type CastVoteRecordBallotType = 'absentee' | 'provisional' | 'standard';

export interface CastVoteRecord
  extends Dictionary<
    | string
    | readonly string[]
    | boolean
    | number
    | readonly number[]
    | BallotLocale
    | SheetOf<InlineBallotImage | null>
    | SheetOf<BallotPageLayout | null>
  > {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: CastVoteRecordBallotType;
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: SheetOf<number>;
}

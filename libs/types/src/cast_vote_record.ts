import { BallotId, BallotStyleId, PrecinctId } from './election';
import { Dictionary } from './generic';

/**
 * Legacy type, slightly different than the CDF ballot type.
 */
export type CastVoteRecordBallotType = 'absentee' | 'provisional' | 'standard';

/**
 * Legacy cast vote record type, currently used by tally code.
 */
export interface CastVoteRecord
  extends Dictionary<string | readonly string[] | boolean> {
  readonly _precinctId: PrecinctId;
  readonly _ballotId?: BallotId;
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: CastVoteRecordBallotType;
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
}

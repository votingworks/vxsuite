import {
  BallotId,
  BallotStyleId,
  CastVoteRecord,
  Dictionary,
  Election,
  getBallotStyle,
  getContests,
  PrecinctId,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';

export interface CastVoteRecordOptions {
  readonly precinctId?: PrecinctId;
  readonly ballotId?: BallotId;
  readonly ballotStyleId?: BallotStyleId;
  readonly ballotType?: 'absentee' | 'provisional' | 'standard';
  readonly testBallot?: boolean;
  readonly scannerId?: string;
  readonly batchId?: string;
  readonly batchLabel?: string;
}

export function generateCvr(
  election: Election,
  votes: Dictionary<string[]>,
  options: CastVoteRecordOptions
): CastVoteRecord {
  // If precinctId or ballotStyleId are not provided default to the first in the election
  const precinctId = options.precinctId ?? election.precincts[0]?.id;
  const ballotStyleId = options.ballotStyleId ?? election.ballotStyles[0]?.id;
  const { ballotId } = options;
  const ballotType = options.ballotType ?? 'standard';
  const testBallot = !!options.testBallot; // default to false
  const scannerId = options.scannerId ?? 'scanner-1';
  const batchId = options.batchId ?? 'batch-1';
  const batchLabel = options.batchLabel ?? 'Batch 1';

  assert(typeof precinctId === 'string');
  assert(typeof ballotStyleId === 'string');

  // Add in blank votes for any contest in the ballot style not specified.
  const ballotStyle =
    getBallotStyle({
      ballotStyleId,
      election,
    }) ?? election.ballotStyles[0];
  assert(ballotStyle);
  const contestsInBallot = getContests({ ballotStyle, election });
  const allVotes: Dictionary<string[]> = {};
  for (const contest of contestsInBallot) {
    allVotes[contest.id] = contest.id in votes ? votes[contest.id] : [];
  }
  return {
    ...allVotes,
    _precinctId: precinctId,
    _ballotStyleId: ballotStyleId,
    _ballotId: ballotId,
    _ballotType: ballotType,
    _testBallot: testBallot,
    _scannerId: scannerId,
    _batchId: batchId,
    _batchLabel: batchLabel,
  };
}

export function generateFileContentFromCvrs(cvrs: CastVoteRecord[]): string {
  let fileContent = '';
  for (const cvr of cvrs) {
    fileContent += `${JSON.stringify(cvr)}\n`;
  }
  return fileContent;
}

/**
 * Parses the contents of a file of cast vote records. The inverse of
 * {@link generateFileContentFromCvrs}
 */
export function parseCvrsFileContents(
  cvrsFileContents: string
): CastVoteRecord[] {
  const lines = cvrsFileContents.split('\n');
  return lines
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CastVoteRecord);
}

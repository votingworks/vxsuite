import {
  assert,
  assertDefined,
  find,
  integers,
  iter,
} from '@votingworks/basics';
import {
  AnyContest,
  BallotStyleId,
  Candidate,
  CandidateContest,
  Election,
  getBallotStyle,
  getContests,
  GridPosition,
  WriteInCandidate,
} from '@votingworks/types';

/**
 * A test deck ballot with votes for each contest.
 */
export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  gridPositions: GridPosition[];
}

/**
 * Determines the number of positions on a ballot for a contest.
 */
export function numBallotPositions(contest: AnyContest): number {
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

/**
 * Generates a write-in candidate for a test deck.
 */
export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

/**
 * Gets the candidate at a given position on a test deck ballot.
 */
export function getTestDeckCandidateAtIndex(
  contest: CandidateContest,
  position: number
): Candidate {
  assert(position < numBallotPositions(contest)); // safety check
  if (position < contest.candidates.length) {
    return assertDefined(contest.candidates[position]);
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

interface GenerateTestDeckParams {
  election: Election;
  ballotStyleId: BallotStyleId;
  includeOvervotedBallots?: boolean;
  includeBlankBallots?: boolean;
}

/**
 * Generates a set of test deck ballots for a ballot style.
 */
export function generateHandMarkedTestDeckBallots({
  election,
  ballotStyleId,
  includeOvervotedBallots = true,
  includeBlankBallots = true,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const ballotStyle = getBallotStyle({ election, ballotStyleId });

  if (!ballotStyle) {
    throw new Error(`Ballot style not found: ${ballotStyleId}`);
  }

  const gridLayout = election.gridLayouts?.find(
    (layout) => layout.ballotStyleId === ballotStyleId
  );

  if (!gridLayout) {
    throw new Error(
      `Grid layout not found for ballot style '${ballotStyleId}'`
    );
  }

  const contests = getContests({ election, ballotStyle });
  const gridPositionsByContest = iter(gridLayout.gridPositions)
    .groupBy((a, b) => a.contestId === b.contestId)
    .toArray();
  const numBallots =
    iter(gridPositionsByContest)
      .map((group) => group.length)
      .max() ?? 0;

  const ballots: TestDeckBallot[] = integers({
    from: 0,
    through: numBallots - 1,
  })
    .map((ballotNum) => ({
      gridPositions: iter(gridPositionsByContest)
        .filterMap((group) => group[ballotNum])
        .toArray(),
      ballotStyleId,
    }))
    .toArray();

  if (includeOvervotedBallots) {
    // Generates a minimally overvoted ballot - a single overvote in the
    // first contest where an overvote is possible. Does not overvote
    // candidate contests where you must select a write-in to overvote. See
    // discussion: https://github.com/votingworks/vxsuite/issues/1711.
    const overvoteContest = contests.find(
      (contest) =>
        contest.type === 'yesno' || contest.candidates.length > contest.seats
    );
    const gridPositionsForContest = find(
      gridPositionsByContest,
      (group) => group[0]?.contestId === overvoteContest?.id
    );

    if (overvoteContest) {
      ballots.push({
        ballotStyleId,
        gridPositions: gridPositionsForContest.slice(
          0,
          overvoteContest.type === 'yesno' ? 2 : overvoteContest.seats + 1
        ),
      });
    }

    if (includeBlankBallots) {
      ballots.push({
        ballotStyleId,
        gridPositions: [],
      });
      ballots.push({
        ballotStyleId,
        gridPositions: [],
      });
    }
  }

  return ballots;
}

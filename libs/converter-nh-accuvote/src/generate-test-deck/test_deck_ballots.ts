import { assertDefined, integers, iter } from '@votingworks/basics';
import {
  BallotStyleId,
  Election,
  GridPosition,
  getBallotStyle,
  getContests,
} from '@votingworks/types';

/**
 * A test deck ballot with votes for each contest.
 */
export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  gridPositions: GridPosition[];
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
  const gridPositionsByContestId = iter(gridLayout.gridPositions).toMap(
    ({ contestId }) => contestId
  );
  const numBallots =
    iter(gridPositionsByContestId.values())
      .map((group) => group.size)
      .max() ?? 0;

  const ballots: TestDeckBallot[] = integers({
    from: 0,
    through: numBallots - 1,
  })
    .map((ballotNum) => ({
      gridPositions: iter(gridPositionsByContestId.values())
        .filterMap((gridPositions) =>
          iter(gridPositions).skip(ballotNum).first()
        )
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

    if (overvoteContest) {
      const gridPositionsForContest = Array.from(
        assertDefined(gridPositionsByContestId.get(overvoteContest.id))
      );
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

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CandidateId,
  ContestId,
  GridPosition,
  safeParseElection,
} from '@votingworks/types';
import { generateHandMarkedTestDeckBallots } from './test_deck_ballots';

function hackyTallyVotesDoNotUseThis(
  gridPositions: GridPosition[]
): Map<ContestId, Map<CandidateId, number>> {
  const tally = new Map<ContestId, Map<CandidateId, number>>();

  for (const gridPosition of gridPositions) {
    const { contestId } = gridPosition;

    if (!tally.has(contestId)) {
      tally.set(contestId, new Map());
    }

    const contestTally = tally.get(contestId)!;
    const optionId =
      gridPosition.type === 'option'
        ? gridPosition.optionId
        : `write-in-${gridPosition.writeInIndex}`;

    contestTally.set(optionId, (contestTally.get(optionId) || 0) + 1);
  }

  return tally;
}

test('generateTestDeckBallots', () => {
  const election = safeParseElection(
    readFileSync(
      join(__dirname, '../../test/fixtures/rochester-primary/election.json'),
      'utf8'
    )
  ).unsafeUnwrap();

  for (const ballotStyle of election.ballotStyles) {
    const testBallots = generateHandMarkedTestDeckBallots({
      election,
      ballotStyleId: ballotStyle.id,
      includeOvervotedBallots: false,
    });

    expect(
      hackyTallyVotesDoNotUseThis(
        testBallots.flatMap(({ gridPositions }) => gridPositions)
      )
    ).toMatchSnapshot();
  }
});

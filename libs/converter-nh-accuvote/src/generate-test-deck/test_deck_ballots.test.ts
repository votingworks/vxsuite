import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { CandidateId, ContestId, GridPosition } from '@votingworks/types';
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

    contestTally.set(optionId, (contestTally.get(optionId) ?? 0) + 1);
  }

  return tally;
}

test('generateTestDeckBallots', () => {
  const { election } = electionGridLayoutNewHampshireHudsonFixtures;

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

test('generateTestDeckBallots with overvotes', () => {
  const { election } = electionGridLayoutNewHampshireHudsonFixtures;

  for (const ballotStyle of election.ballotStyles) {
    const testBallots = generateHandMarkedTestDeckBallots({
      election,
      ballotStyleId: ballotStyle.id,
      includeOvervotedBallots: true,
    });

    expect(
      hackyTallyVotesDoNotUseThis(
        testBallots.flatMap(({ gridPositions }) => gridPositions)
      )
    ).toMatchSnapshot();
  }
});

test('invalid ballot style', () => {
  const { election } = electionGridLayoutNewHampshireHudsonFixtures;

  expect(() =>
    generateHandMarkedTestDeckBallots({
      election,
      ballotStyleId: 'invalid',
    })
  ).toThrowErrorMatchingInlineSnapshot(`"Ballot style not found: invalid"`);
});

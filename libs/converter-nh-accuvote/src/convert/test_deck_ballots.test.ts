import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  Candidate,
  CandidateId,
  ContestId,
  VotesDict,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { generateTestDeckBallots } from './test_deck_ballots';

function hackyTallyVotesDoNotUseThis(
  votesDicts: VotesDict[]
): Map<ContestId, Map<CandidateId, number>> {
  const tally = new Map<ContestId, Map<CandidateId, number>>();

  for (const votesDict of votesDicts) {
    for (const [contestId, candidates] of Object.entries(votesDict)) {
      assert(Array.isArray(candidates));

      if (!tally.has(contestId)) {
        tally.set(contestId, new Map());
      }

      const contestTally = tally.get(contestId)!;

      for (const candidate of candidates as Candidate[]) {
        contestTally.set(
          candidate.id,
          (contestTally.get(candidate.id) || 0) + 1
        );
      }
    }
  }

  return tally;
}

test('generateTestDeckBallots', () => {
  const { election } = electionFamousNames2021Fixtures;

  const testBallots = generateTestDeckBallots({
    election,
    markingMethod: 'hand',
    includeOvervotedBallots: false,
  });

  expect(
    hackyTallyVotesDoNotUseThis(testBallots.map(({ votes }) => votes))
  ).toMatchSnapshot();
});

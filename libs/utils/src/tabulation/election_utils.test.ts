import { find } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import {
  coalesceGroupsAcrossParty,
  doesContestAppearOnPartyBallot,
} from './election_utils';

describe('doesContestAppearOnPartyBallot', () => {
  test('in a primary election', () => {
    const electionDefinition = electionMinimalExhaustiveSampleDefinition;

    const { contests } = electionDefinition.election;
    const mammalContest = find(contests, (c) => c.id === 'best-animal-mammal');
    const fishContest = find(contests, (c) => c.id === 'best-animal-fish');
    const ballotMeasure = find(contests, (c) => c.id === 'fishing');

    expect(doesContestAppearOnPartyBallot(mammalContest, '0')).toEqual(true);
    expect(doesContestAppearOnPartyBallot(mammalContest, '1')).toEqual(false);

    expect(doesContestAppearOnPartyBallot(fishContest, '0')).toEqual(false);
    expect(doesContestAppearOnPartyBallot(fishContest, '1')).toEqual(true);

    expect(doesContestAppearOnPartyBallot(ballotMeasure, '0')).toEqual(true);
    expect(doesContestAppearOnPartyBallot(ballotMeasure, '1')).toEqual(true);
  });

  test('in a general election', () => {
    const { electionDefinition } = electionFamousNames2021Fixtures;

    const { contests } = electionDefinition.election;
    const generalElectionCandidateContest = find(
      contests,
      (c) => c.type === 'candidate'
    );

    expect(
      doesContestAppearOnPartyBallot(generalElectionCandidateContest)
    ).toEqual(true);
  });
});

interface BallotCount {
  ballotCount: number;
}
test('coalesceGroupsAcrossParty', () => {
  const ballotCounts: Tabulation.GroupList<BallotCount> = [
    { precinctId: 'A', partyId: '0', ballotCount: 1 },
    { precinctId: 'A', partyId: '1', ballotCount: 2 },
    { precinctId: 'B', partyId: '0', ballotCount: 3 },
    { precinctId: 'B', partyId: '1', ballotCount: 4 },
  ];

  const coalescedBallotCounts = coalesceGroupsAcrossParty(
    ballotCounts,
    { groupByPrecinct: true },
    (partyBallotCounts) => {
      return {
        ballotCount: partyBallotCounts.reduce(
          (sum, { ballotCount }) => sum + ballotCount,
          0
        ),
      };
    }
  );

  expect(coalescedBallotCounts).toEqual([
    {
      precinctId: 'A',
      ballotCount: 3,
    },
    {
      precinctId: 'B',
      ballotCount: 7,
    },
  ]);
});

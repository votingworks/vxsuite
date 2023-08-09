import { find } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { doesContestAppearOnPartyBallot } from './election_utils';

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

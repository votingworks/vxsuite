import * as CVR from './cdf/cast-vote-records';
import * as Tabulation from './tabulation';

test('Tabulation.VotingMethod in sync with CVR.vxBallotType', () => {
  // confirm that Tabulation.VotingMethod is a subset of CVR.vxBallotType
  const vxBallotTypes = Object.values(CVR.vxBallotType) as string[];
  for (const votingMethod of Tabulation.VOTING_METHODS) {
    expect(vxBallotTypes.includes(votingMethod)).toEqual(true);
  }

  // confirm sets are the same size
  expect(Tabulation.VOTING_METHODS).toHaveLength(vxBallotTypes.length);

  // proved sets are equal
});

/* eslint-disable @typescript-eslint/no-unused-vars */
import * as CVR from './cdf/cast-vote-records';
import * as Tabulation from './tabulation';

// compile-time test
test('Tabulation.VotingMethod in sync with CVR.vxBallotType', () => {
  // CVR.vxBallotType is subset of Tabulation.VotingMethod
  const votingMethods = Object.values(
    CVR.vxBallotType
  ) as Tabulation.VotingMethod[];

  // Tabulation.VotingMethod is subset of CVR.vxBallotType
  const ballotTypes = votingMethods as CVR.vxBallotType[];

  // Two sets are equal
});

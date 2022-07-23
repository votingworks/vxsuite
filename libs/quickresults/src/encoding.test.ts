import { electionSampleDefinition } from '@votingworks/fixtures';
import {
  CompleteTally,
  generateZeroSingleTallyForVotingMethod,
  VotingMethod,
} from '@votingworks/types';
import { encodeCompleteTally, decodeCompleteTally } from './encoding';

test('encodeCompleteTally & decodeCompleteTally work and do not crash', () => {
  const zeroSingleTally = generateZeroSingleTallyForVotingMethod(
    electionSampleDefinition.election,
    VotingMethod.Precinct
  );

  const zeroCompleteTally: CompleteTally = {
    generatedAt: new Date(),
    precinctTallies: {},
  };

  zeroCompleteTally.precinctTallies[
    electionSampleDefinition.election.precincts[0]!.id
  ] = zeroSingleTally;

  const encoded = encodeCompleteTally(
    zeroCompleteTally,
    electionSampleDefinition
  );
  const decoded = decodeCompleteTally(encoded, electionSampleDefinition);

  // generated at may be off by some milliseconds
  expect(zeroCompleteTally.precinctTallies).toEqual(decoded.precinctTallies);
});

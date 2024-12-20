import { expect, test } from 'vitest';
import { readElectionTwoPartyPrimary } from '@votingworks/fixtures';
import { generateMockVotes } from './bmd_votes_mock';

const electionTwoPartyPrimary = readElectionTwoPartyPrimary();

test('generateMockVotes is consistent', () => {
  expect(generateMockVotes(electionTwoPartyPrimary)).toEqual(
    generateMockVotes(electionTwoPartyPrimary)
  );
});

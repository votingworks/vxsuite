import { expect, test } from 'vitest';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { generateMockVotes } from './bmd_votes_mock';

test('generateMockVotes is consistent', () => {
  expect(generateMockVotes(electionTwoPartyPrimaryDefinition.election)).toEqual(
    generateMockVotes(electionTwoPartyPrimaryDefinition.election)
  );
});

import {
  electionGeneralDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';

import { canDistinguishVotingMethods } from './elections';

test('returns true if gridLayouts is absent', () => {
  expect(
    canDistinguishVotingMethods(electionGeneralDefinition.election)
  ).toBeTruthy();
});

test('returns false if gridLayouts is present', () => {
  expect(
    canDistinguishVotingMethods(
      electionGridLayoutNewHampshireAmherstFixtures.election
    )
  ).toBeFalsy();
});

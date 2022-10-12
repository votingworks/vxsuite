import {
  electionSampleDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';

import { canDistinguishPrecinctAndAbsenteeBallots } from './elections';

test('returns true if gridLayouts is absent', () => {
  expect(
    canDistinguishPrecinctAndAbsenteeBallots(electionSampleDefinition.election)
  ).toBeTruthy();
});

test('returns false if gridLayouts is present', () => {
  expect(
    canDistinguishPrecinctAndAbsenteeBallots(
      electionGridLayoutNewHampshireAmherstFixtures.election
    )
  ).toBeFalsy();
});

import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionGridLayoutNewHampshireAmherstFixtures,
} from '@votingworks/fixtures';
import { getElectionSheetCount } from '.';

test('getElectionSheetCount', () => {
  // election with no gridLayouts available
  expect(
    getElectionSheetCount(electionGeneralDefinition.election)
  ).toBeUndefined();

  // single page election
  expect(
    getElectionSheetCount(
      electionGridLayoutNewHampshireAmherstFixtures.election
    )
  ).toEqual(1);

  // multi-page election
  expect(
    getElectionSheetCount(electionFamousNames2021Fixtures.multiSheetElection)
  ).toEqual(3);
});

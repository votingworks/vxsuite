import {
  electionFamousNames2021Fixtures,
  electionGeneralDefinition,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { getMaxSheetsPerBallot } from '.';

test('getMaxSheetsPerBallot', () => {
  // election with no gridLayouts available
  expect(
    getMaxSheetsPerBallot(electionGeneralDefinition.election)
  ).toBeUndefined();

  // single page election
  expect(
    getMaxSheetsPerBallot(
      electionGridLayoutNewHampshireTestBallotFixtures.election
    )
  ).toEqual(1);

  // multi-page election
  expect(
    getMaxSheetsPerBallot(electionFamousNames2021Fixtures.multiSheetElection)
  ).toEqual(3);
});

import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { getMaxSheetsPerBallot } from '.';

test('getMaxSheetsPerBallot', () => {
  // election with no gridLayouts available
  expect(getMaxSheetsPerBallot(readElectionGeneral())).toBeUndefined();

  // single page election
  expect(
    getMaxSheetsPerBallot(
      electionGridLayoutNewHampshireTestBallotFixtures.readElection()
    )
  ).toEqual(1);

  // multi-page election
  expect(
    getMaxSheetsPerBallot(
      electionFamousNames2021Fixtures.makeMultiSheetElection()
    )
  ).toEqual(3);
});

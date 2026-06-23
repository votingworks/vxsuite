import { expect, test } from 'vitest';
import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
  readElectionGeneral,
} from '@votingworks/fixtures';
import { electionHasBallotPositions, getMaxSheetsPerBallot } from './index';

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

test('electionHasBallotPositions', () => {
  // election with no ballot positions
  expect(electionHasBallotPositions(readElectionGeneral())).toEqual(false);

  // election whose ballot styles have ballot positions
  expect(
    electionHasBallotPositions(
      electionFamousNames2021Fixtures.makeMultiSheetElection()
    )
  ).toEqual(true);
});

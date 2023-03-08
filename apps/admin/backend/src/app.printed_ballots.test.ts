import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('printed ballots', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const mockPrintedBallot: Admin.PrintedBallot = {
    ballotStyleId: '12',
    precinctId: '23',
    locales: { primary: 'en-US' },
    ballotMode: Admin.BallotMode.Official,
    ballotType: 'standard',
    numCopies: 4,
  };

  expect(await apiClient.getPrintedBallots()).toEqual([]);
  await apiClient.addPrintedBallots({
    printedBallot: mockPrintedBallot,
  });

  expect(await apiClient.getPrintedBallots()).toEqual([
    expect.objectContaining(mockPrintedBallot),
  ]);
  expect(
    await apiClient.getPrintedBallots({ ballotMode: Admin.BallotMode.Official })
  ).toEqual([expect.objectContaining(mockPrintedBallot)]);
  expect(
    await apiClient.getPrintedBallots({ ballotMode: Admin.BallotMode.Draft })
  ).toEqual([]);
  expect(
    await apiClient.getPrintedBallots({ ballotMode: Admin.BallotMode.Sample })
  ).toEqual([]);
  expect(
    await apiClient.getPrintedBallots({ ballotMode: Admin.BallotMode.Test })
  ).toEqual([]);
});

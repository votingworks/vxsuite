import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
} from '@votingworks/utils';
import { BallotStyleGroupId } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app.js';

vi.setConfig({
  testTimeout: 60_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK, 'TRUE');
  vi.stubEnv(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION,
    'TRUE'
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('card counts', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      groupBy: {},
    })
  ).toEqual([
    {
      bmd: [56],
      hmpb: [],
      manual: 10,
    },
  ]);

  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: [56],
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: [56],
      hmpb: [],
      manual: 0,
    },
  ]);

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: [28],
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: [28],
      hmpb: [],
      manual: 0,
    },
  ]);
});

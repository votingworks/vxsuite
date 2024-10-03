import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('card counts', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;
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
    ballotStyleGroupId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] },
      groupBy: {},
    })
  ).toEqual([
    {
      bmd: 56,
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
      bmd: 56,
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: 56,
      hmpb: [],
      manual: 0,
    },
  ]);

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] },
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: 28,
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: 28,
      hmpb: [],
      manual: 0,
    },
  ]);
});

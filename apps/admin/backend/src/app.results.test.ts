import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
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

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
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
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('card counts', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      groupBy: { groupByPrecinct: true, groupByBallotStyle: true },
    })
  ).toMatchObject(
    expect.arrayContaining([
      {
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        bmd: 28,
        hmpb: [],
        manual: 10,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-1',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
      {
        ballotStyleId: '1M',
        precinctId: 'precinct-2',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-2',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
    ])
  );
});

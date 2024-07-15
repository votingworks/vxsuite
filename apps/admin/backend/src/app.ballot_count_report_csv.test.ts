import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { tmpNameSync } from 'tmp';
import { readFileSync } from 'fs';
import { LogEventId } from '@votingworks/logging';
import { Tabulation } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { parseCsv } from '../test/csv';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';

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
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

it('logs success if export succeeds', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const offLimitsPath = '/root/hidden';
  const failedExportResult = await apiClient.exportBallotCountReportCsv({
    path: offLimitsPath,
    filter: {},
    groupBy: {},
    includeSheetCounts: false,
  });
  expect(failedExportResult.isErr()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      filename: offLimitsPath,
      message: `Failed to save ballot count report CSV file to ${offLimitsPath} on the USB drive.`,
    }
  );
});

it('logs failure if export fails', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const path = tmpNameSync();
  const exportResult = await apiClient.exportBallotCountReportCsv({
    path,
    filter: {},
    groupBy: {},
    includeSheetCounts: false,
  });
  expect(exportResult.isOk()).toEqual(true);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      filename: path,
      message: `Saved ballot count report CSV file to ${path} on the USB drive.`,
    }
  );
});

async function getParsedExport({
  apiClient,
  groupBy = {},
  filter = {},
}: {
  apiClient: Client<Api>;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
}): Promise<ReturnType<typeof parseCsv>> {
  const path = tmpNameSync();
  const exportResult = await apiClient.exportBallotCountReportCsv({
    path,
    groupBy,
    filter,
    includeSheetCounts: false,
  });
  expect(exportResult.isOk()).toEqual(true);
  return parseCsv(readFileSync(path, 'utf-8').toString());
}

it('creates accurate ballot count reports', async () => {
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  // add CVR data
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // add manual data
  await apiClient.setManualResults({
    precinctId: election.precincts[0]!.id,
    votingMethod: 'absentee',
    ballotStyleId: election.ballotStyles[0]!.id,
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await getParsedExport({
      apiClient,
      groupBy: { groupByVotingMethod: true },
    })
  ).toEqual({
    headers: ['Voting Method', 'Manual', 'BMD', 'HMPB', 'Total'],
    rows: [
      {
        Manual: '0',
        BMD: '0',
        HMPB: '92',
        Total: '92',
        'Voting Method': 'Precinct',
      },
      {
        Manual: '10',
        BMD: '0',
        HMPB: '92',
        Total: '102',
        'Voting Method': 'Absentee',
      },
    ],
  });

  expect(
    await getParsedExport({
      apiClient,
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
    })
  ).toEqual({
    headers: [
      'Precinct',
      'Precinct ID',
      'Voting Method',
      'Manual',
      'BMD',
      'HMPB',
      'Total',
    ],
    rows: [
      {
        BMD: '0',
        HMPB: '92',
        Manual: '0',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-',
        Total: '92',
        'Voting Method': 'Precinct',
      },
      {
        BMD: '0',
        HMPB: '92',
        Manual: '10',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-',
        Total: '102',
        'Voting Method': 'Absentee',
      },
    ],
  });
});

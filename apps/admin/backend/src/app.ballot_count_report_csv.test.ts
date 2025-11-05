import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readFileSync } from 'node:fs';
import { LogEventId } from '@votingworks/logging';
import { formatBallotHash, Tabulation } from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { err, ok } from '@votingworks/basics';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { mockFileName, parseCsv } from '../test/csv';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { generateReportPath } from './util/filenames';

vi.setConfig({
  testTimeout: 60_000,
});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
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

test('logs failure if export fails', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.removeUsbDrive();

  const filename = mockFileName();
  const failedExportResult = await apiClient.exportBallotCountReportCsv({
    filename,
    filter: {},
    groupBy: {},
    includeSheetCounts: false,
  });
  expect(failedExportResult).toEqual(err(expect.anything()));
  const usbRelativeFilePath = generateReportPath(electionDefinition, filename);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'failure',
      path: usbRelativeFilePath,
      message: `Failed to save ballot count report CSV file to ${usbRelativeFilePath} on the USB drive.`,
    }
  );
});

test('logs success if export succeeds', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger, mockUsbDrive } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const filename = mockFileName();
  const exportResult = await apiClient.exportBallotCountReportCsv({
    filename,
    filter: {},
    groupBy: {},
    includeSheetCounts: false,
  });
  expect(exportResult).toEqual(ok(expect.anything()));
  const usbRelativeFilePath = generateReportPath(electionDefinition, filename);
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.FileSaved,
    'election_manager',
    {
      disposition: 'success',
      path: usbRelativeFilePath,
      message: `Saved ballot count report CSV file to ${usbRelativeFilePath} on the USB drive.`,
    }
  );
});

async function getParsedExport({
  apiClient,
  mockUsbDrive,
  groupBy = {},
  filter = {},
}: {
  apiClient: Client<Api>;
  mockUsbDrive: MockUsbDrive;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
}): Promise<ReturnType<typeof parseCsv>> {
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const filename = mockFileName();
  const exportResult = await apiClient.exportBallotCountReportCsv({
    filename,
    groupBy,
    filter,
    includeSheetCounts: false,
  });
  const [filePath] = exportResult.unsafeUnwrap();
  return parseCsv(readFileSync(filePath!).toString());
}

test('creates accurate ballot count reports', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth, mockUsbDrive } = buildTestEnvironment();
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
    ballotStyleGroupId: election.ballotStyles[0]!.groupId,
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  mockUsbDrive.insertUsbDrive({});
  expect(
    await getParsedExport({
      apiClient,
      mockUsbDrive,
      groupBy: { groupByVotingMethod: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
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
      mockUsbDrive,
      groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
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
        'Precinct ID': 'town-id-00701-precinct-id-default',
        Total: '92',
        'Voting Method': 'Precinct',
      },
      {
        BMD: '0',
        HMPB: '92',
        Manual: '10',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-default',
        Total: '102',
        'Voting Method': 'Absentee',
      },
    ],
  });
});

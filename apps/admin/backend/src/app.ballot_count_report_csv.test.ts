import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionCombinedBallotPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { readFileSync } from 'node:fs';
import { LogEventId } from '@votingworks/logging';
import {
  DEFAULT_SYSTEM_SETTINGS,
  formatBallotHash,
  Tabulation,
} from '@votingworks/types';
import { Client } from '@votingworks/grout';
import { err, ok } from '@votingworks/basics';
import { mockFileName, parseCsv } from '../test/csv';
import {
  attachUsbDrive,
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../test/mock_cvr_file';
import { Api } from './app';
import { generateReportPath } from './util/filenames';
import { seedCombinedBallotPrimaryCvrsAndAdjudications } from '../test/combined_ballot_primary_fixture';

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

function configureMachineWithEarlyVoting(
  ...[apiClient, auth, electionDefinition]: Parameters<typeof configureMachine>
): Promise<string> {
  return configureMachine(apiClient, auth, electionDefinition, undefined, {
    ...DEFAULT_SYSTEM_SETTINGS,
    enableEarlyVoting: true,
  });
}

test('logs failure if export fails', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;

  const { apiClient, auth, logger } = buildTestEnvironment();
  await configureMachineWithEarlyVoting(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

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

  const { apiClient, auth, logger, usbPlatform } = buildTestEnvironment();
  await configureMachineWithEarlyVoting(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await attachUsbDrive(apiClient, usbPlatform);

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
  groupBy = {},
  filter = {},
}: {
  apiClient: Client<Api>;
  groupBy?: Tabulation.GroupBy;
  filter?: Tabulation.Filter;
}): Promise<ReturnType<typeof parseCsv>> {
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

  const { apiClient, auth, usbPlatform, workspace } = buildTestEnvironment();
  const electionId = await configureMachineWithEarlyVoting(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  // add election day CVR data
  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  // add additional early voting CVR data
  const mockEarlyVotingCvrs: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: election.ballotStyles[0]!.groupId,
      batchId: 'early-voting-batch',
      scannerId: 'scanner-ev',
      precinctId: election.precincts[0]!.id,
      votingMethod: 'precinct',
      votes: {},
      card: { type: 'hmpb', sheetNumber: 1 },
      ballotCastingMode: 'early_voting',
      multiplier: 15,
    },
    {
      ballotStyleGroupId: election.ballotStyles[0]!.groupId,
      batchId: 'early-voting-batch',
      scannerId: 'scanner-ev',
      precinctId: election.precincts[0]!.id,
      votingMethod: 'absentee',
      votes: {},
      card: { type: 'hmpb', sheetNumber: 1 },
      ballotCastingMode: 'early_voting',
      multiplier: 5,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: mockEarlyVotingCvrs,
    store: workspace.store,
    pollingPlaceId: 'polling-place-1',
  });

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

  await attachUsbDrive(apiClient, usbPlatform);
  expect(
    await getParsedExport({
      apiClient,
      groupBy: { groupByVotingMethod: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
    headers: ['Voting Method', 'Manual', 'Scanned', 'Total'],
    rows: [
      {
        Manual: '0',
        Scanned: '20',
        Total: '20',
        'Voting Method': 'Early Voting',
      },
      {
        Manual: '0',
        Scanned: '92',
        Total: '92',
        'Voting Method': 'Precinct',
      },
      {
        Manual: '10',
        Scanned: '92',
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
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
    headers: [
      'Precinct',
      'Precinct ID',
      'Voting Method',
      'Manual',
      'Scanned',
      'Total',
    ],
    rows: [
      {
        Scanned: '20',
        Manual: '0',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-default',
        Total: '20',
        'Voting Method': 'Early Voting',
      },
      {
        Scanned: '92',
        Manual: '0',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-default',
        Total: '92',
        'Voting Method': 'Precinct',
      },
      {
        Scanned: '92',
        Manual: '10',
        Precinct: 'Test Ballot',
        'Precinct ID': 'town-id-00701-precinct-id-default',
        Total: '102',
        'Voting Method': 'Absentee',
      },
    ],
  });
});

test('combined ballot primary: groups by inferred party with a No Party row', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, usbPlatform, workspace } = buildTestEnvironment();
  const electionId = await configureMachineWithEarlyVoting(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  // 10 CVRs in precinct-1 after adjudication:
  //   4 Dem, 2 Rep, 1 Lib, 3 No Party (nonpartisan-only / crossover / flipped)
  await seedCombinedBallotPrimaryCvrsAndAdjudications({
    apiClient,
    electionId,
    store: workspace.store,
  });

  await attachUsbDrive(apiClient, usbPlatform);

  expect(
    await getParsedExport({
      apiClient,
      groupBy: { groupByPrecinct: true, groupByParty: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
    headers: ['Precinct', 'Precinct ID', 'Party', 'Party ID', 'Total'],
    rows: [
      {
        Precinct: 'Precinct 1',
        'Precinct ID': 'precinct-1',
        Party: 'Democratic',
        'Party ID': 'democratic-party',
        Total: '4',
      },
      {
        Precinct: 'Precinct 1',
        'Precinct ID': 'precinct-1',
        Party: 'Republican',
        'Party ID': 'republican-party',
        Total: '2',
      },
      {
        Precinct: 'Precinct 1',
        'Precinct ID': 'precinct-1',
        Party: 'Libertarian',
        'Party ID': 'libertarian-party',
        Total: '1',
      },
      // No Party group totals only count first-sheet HMPB. The
      // nonpartisan-only CVR uses sheet 2, so it's omitted from Total.
      {
        Precinct: 'Precinct 1',
        'Precinct ID': 'precinct-1',
        Party: 'No Party',
        'Party ID': '',
        Total: '2',
      },
      {
        Precinct: 'Precinct 2',
        'Precinct ID': 'precinct-2',
        Party: 'Democratic',
        'Party ID': 'democratic-party',
        Total: '0',
      },
      {
        Precinct: 'Precinct 2',
        'Precinct ID': 'precinct-2',
        Party: 'Republican',
        'Party ID': 'republican-party',
        Total: '0',
      },
      {
        Precinct: 'Precinct 2',
        'Precinct ID': 'precinct-2',
        Party: 'Libertarian',
        'Party ID': 'libertarian-party',
        Total: '0',
      },
      {
        Precinct: 'Precinct 2',
        'Precinct ID': 'precinct-2',
        Party: 'No Party',
        'Party ID': '',
        Total: '0',
      },
    ],
  });
});

test('combined ballot primary: groupByParty with No Party filter', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, usbPlatform, workspace } = buildTestEnvironment();
  const electionId = await configureMachineWithEarlyVoting(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  await seedCombinedBallotPrimaryCvrsAndAdjudications({
    apiClient,
    electionId,
    store: workspace.store,
  });

  await attachUsbDrive(apiClient, usbPlatform);

  // partyIds: [NO_PARTY_ID] — only the No Party row. 2 = the crossover and
  // flipped-Dem HMPB sheet 1 ballots (the nonpartisan-only sheet 2 ballot
  // is excluded from Total).
  expect(
    await getParsedExport({
      apiClient,
      filter: { partyIds: [Tabulation.NO_PARTY_ID] },
      groupBy: { groupByParty: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
    headers: ['Party', 'Party ID', 'Total'],
    rows: [
      {
        Party: 'No Party',
        'Party ID': '',
        Total: '2',
      },
    ],
  });

  // partyIds: ['democratic-party', NO_PARTY_ID] — Dem + No Party rows.
  expect(
    await getParsedExport({
      apiClient,
      filter: { partyIds: ['democratic-party', Tabulation.NO_PARTY_ID] },
      groupBy: { groupByParty: true },
    })
  ).toEqual({
    metadata: {
      title: 'test-file-name',
      ballotHash: formatBallotHash(electionDefinition.ballotHash),
    },
    headers: ['Party', 'Party ID', 'Total'],
    rows: [
      {
        Party: 'Democratic',
        'Party ID': 'democratic-party',
        Total: '4',
      },
      {
        Party: 'No Party',
        'Party ID': '',
        Total: '2',
      },
    ],
  });
});

import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { assertDefined, err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BatteryInfo, mockElectionPackageFileTree } from '@votingworks/backend';
import {
  BallotType,
  DEV_MACHINE_ID,
  EncodedBallotEntry,
  ElectionDefinition,
  LanguageCode,
  PrinterStatus,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LogEventId, MockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
  getMockMultiLanguageElectionDefinition,
} from '@votingworks/utils';
import {
  getMockConnectedPrinterStatus,
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { MockUsbDrive } from '@votingworks/usb-drive';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  buildBallotsForElection,
} from '../test/app';
import { Api } from './app';
import { Workspace } from './util/workspace';

const mockFeatureFlagger = getFeatureFlagMock();

let batteryInfo: BatteryInfo | null = null;

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    // eslint-disable-next-line @typescript-eslint/require-await
    async getBatteryInfo(): Promise<BatteryInfo | null> {
      return batteryInfo;
    },
  })
);

// Pre-built election definitions and ballots for common test scenarios
interface SharedFixtures {
  famousNamesMultiLangElectionDefinition: ElectionDefinition;
  famousNamesMultiLangOfficialBallots: EncodedBallotEntry[];
  famousNamesMultiLangOfficialAndTestBallots: EncodedBallotEntry[];
  primaryPrecinctSplitsMultiLangElectionDefinition: ElectionDefinition;
  primaryPrecinctSplitsMultiLangOfficialBallots: EncodedBallotEntry[];
}

let sharedFixtures: SharedFixtures;

let server: Server | undefined;

let apiClient: grout.Client<Api>;
let auth: DippedSmartCardAuthApi;
let logger: MockLogger;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let workspace: Workspace;

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  ({
    apiClient,
    auth,
    logger,
    mockUsbDrive,
    mockPrinterHandler,
    server,
    workspace,
  } = buildTestEnvironment());

  batteryInfo = null;
  mockUsbDrive.usbDrive.sync.expectRepeatedCallsWith().resolves();
});

afterEach(() => {
  mockPrinterHandler?.cleanup();
  server?.close();
  server = undefined;
});

// Build shared fixtures once before all tests
beforeAll(async () => {
  const famousNamesMultiLangElectionDefinition =
    getMockMultiLanguageElectionDefinition(
      electionFamousNames2021Fixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

  const primaryPrecinctSplitsMultiLangElectionDefinition =
    getMockMultiLanguageElectionDefinition(
      electionPrimaryPrecinctSplitsFixtures.readElectionDefinition(),
      [LanguageCode.ENGLISH]
    );

  const [
    famousNamesMultiLangOfficialBallots,
    famousNamesMultiLangOfficialAndTestBallots,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  ] = await Promise.all([
    buildBallotsForElection({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballotModes: ['official'],
    }),
    buildBallotsForElection({
      electionDefinition: famousNamesMultiLangElectionDefinition,
      ballotModes: ['official', 'test'],
    }),
    buildBallotsForElection({
      electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
      ballotModes: ['official'],
    }),
  ]);

  sharedFixtures = {
    famousNamesMultiLangElectionDefinition,
    famousNamesMultiLangOfficialBallots,
    famousNamesMultiLangOfficialAndTestBallots,
    primaryPrecinctSplitsMultiLangElectionDefinition,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  };
});

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('printer status', async () => {
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>(
    getMockConnectedPrinterStatus(HP_LASER_PRINTER_CONFIG)
  );

  mockPrinterHandler.disconnectPrinter();
  expect(await apiClient.getPrinterStatus()).toEqual<PrinterStatus>({
    connected: false,
  });
});

test('getDeviceStatuses and ejectUsbDrive', async () => {
  // Start with a mounted USB drive.
  mockUsbDrive.insertUsbDrive({});
  batteryInfo = { level: 0.52, discharging: true };

  // Allow eject() and then simulate the drive being removed.
  mockUsbDrive.usbDrive.eject.expectCallWith().resolves();

  const statuses = await apiClient.getDeviceStatuses();
  expect(statuses.usbDrive).toEqual(
    expect.objectContaining({ status: 'mounted' })
  );
  expect(statuses.printer).toEqual({ connected: false });
  expect(statuses.battery).toEqual({ level: 0.52, discharging: true });

  await apiClient.ejectUsbDrive();
  mockUsbDrive.removeUsbDrive();

  const statusesAfterEject = await apiClient.getDeviceStatuses();
  expect(statusesAfterEject.usbDrive).toEqual({ status: 'no_drive' });

  // Test when battery info is null (returns undefined)
  batteryInfo = null;
  const statusesNoBattery = await apiClient.getDeviceStatuses();
  expect(statusesNoBattery.battery).toBeUndefined();

  mockUsbDrive.usbDrive.eject.assertComplete();
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();

  const ballotStyleId = electionDefinition.election.ballotStyles[0]!.id;
  const precinctId = electionDefinition.election.precincts[0]!.id;
  const ballots: EncodedBallotEntry[] = [
    {
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
    },
  ];

  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      ballots,
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({ disposition: 'success' })
  );

  expect(await apiClient.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: expect.any(String),
  });

  const storedBallots = await apiClient.getBallots({});
  expect(storedBallots).toHaveLength(1);
  expect(storedBallots[0]).toMatchObject({
    ballotStyleId,
    precinctId,
    ballotType: BallotType.Precinct,
    ballotMode: 'official',
    encodedBallot: expect.any(String),
    ballotPrintId: expect.any(Number),
  });
});

test('configureElectionPackageFromUsb logs failure when there is an error reading from usb', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  mockElectionManagerAuth(auth, electionDefinition);

  // Insert USB with no election package to simulate an error
  mockUsbDrive.insertUsbDrive({});

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(err({ type: 'no_election_package_on_usb_drive' }));
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ElectionConfigured,
    expect.objectContaining({
      disposition: 'failure',
      message: 'Error configuring machine.',
    })
  );
});

test('configureElectionPackageFromUsb returns no_ballots error when election package has no ballots', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      // No ballots provided
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(err({ type: 'no_ballots' }));
});

test('configureElectionPackageFromUsb will automatically set precinct for single precinct election on configure', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition();
  const ballotStyleId = electionDefinition.election.ballotStyles[0]!.id;
  const precinctId = electionDefinition.election.precincts[0]!.id;
  const ballots: EncodedBallotEntry[] = [
    {
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
    },
  ];

  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      ballots,
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));

  expect(await apiClient.getPrecinctSelection()).toEqual(
    singlePrecinctSelectionFor(precinctId)
  );
});

test('setting precinct', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  expect(await apiClient.getPrecinctSelection()).toBeNull();

  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  expect(await apiClient.getPrecinctSelection()).toBeNull();

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  expect(await apiClient.getPrecinctSelection()).toEqual(
    ALL_PRECINCTS_SELECTION
  );

  const precinctId = electionDefinition.election.precincts[0]!.id;
  const singlePrecinctSelection = singlePrecinctSelectionFor(precinctId);
  await apiClient.setPrecinctSelection({
    precinctSelection: singlePrecinctSelection,
  });
  expect(await apiClient.getPrecinctSelection()).toEqual(
    singlePrecinctSelection
  );
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrecinctConfigurationChanged,
    expect.objectContaining({
      disposition: 'success',
      message: expect.stringContaining('User set the precinct for the machine'),
    })
  );
});

test('mode toggling', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  expect(await apiClient.getTestMode()).toEqual(false);

  await apiClient.setTestMode({ testMode: true });
  expect(await apiClient.getTestMode()).toEqual(true);
  expect(await apiClient.getBallots({})).toHaveLength(0);
  expect(await apiClient.getBallotPrintCounts()).toHaveLength(0);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ToggledTestMode,
    expect.objectContaining({ disposition: 'success' })
  );

  await apiClient.setTestMode({ testMode: false });
  expect(await apiClient.getTestMode()).toEqual(false);
  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.ToggledTestMode,
    expect.objectContaining({ disposition: 'success' })
  );
});

test('unconfigureMachine clears election configuration', async () => {
  // Test with a cdf election for coverage
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(testCdfBallotDefinition)
  ).unsafeUnwrap();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  expect(await apiClient.getElectionRecord()).not.toBeNull();

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  await apiClient.setTestMode({ testMode: true });

  expect(await apiClient.getPrecinctSelection()).not.toBeNull();

  await apiClient.unconfigureMachine();

  expect(await apiClient.getElectionRecord()).toBeNull();
  expect(await apiClient.getPrecinctSelection()).toBeNull();
  expect(await apiClient.getBallots({})).toEqual([]);
  expect(await apiClient.getTestMode()).toEqual(false);
  expect(workspace.store.getSystemSettings()).toBeUndefined();
});

test('printBallot logs when ballot is not found', async () => {
  const {
    famousNamesMultiLangElectionDefinition,
    famousNamesMultiLangOfficialBallots,
  } = sharedFixtures;

  // Only configure official ballots so that printing in test mode will result in ballot not found
  await configureMachine({
    electionDefinition: famousNamesMultiLangElectionDefinition,
    ballots: famousNamesMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.setTestMode({ testMode: true });

  const precinctId =
    famousNamesMultiLangElectionDefinition.election.precincts[0]!.id;

  // Try to print a ballot - the precinct exists but no test mode ballot is stored
  await apiClient.printBallot({
    precinctId,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 1,
  });

  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PrinterPrintRequest,
    expect.objectContaining({
      disposition: 'failure',
      message: 'No ballot found',
    })
  );
});

test('end-to-end printing flow updates getBallotPrintCounts', async () => {
  const {
    famousNamesMultiLangElectionDefinition,
    famousNamesMultiLangOfficialBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition: famousNamesMultiLangElectionDefinition,
    ballots: famousNamesMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const { ballotStyles } = famousNamesMultiLangElectionDefinition.election;
  const styleA = ballotStyles[0]!;
  const styleB = ballotStyles[1]!;
  const precinctA = styleA.precincts[0]!;
  const precinctB = styleB.precincts[0]!;

  // One ballot printed twice (precinct) + once (absentee), then another ballot once (precinct).
  await apiClient.printBallot({
    precinctId: precinctA,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 2,
  });
  await apiClient.printBallot({
    precinctId: precinctA,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Absentee,
    copies: 1,
  });
  await apiClient.printBallot({
    precinctId: precinctB,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 1,
  });

  const counts = await apiClient.getBallotPrintCounts();
  const rowA = counts.find(
    (c) => c.ballotStyleId === styleA.id && c.precinctId === precinctA
  );
  const rowB = counts.find(
    (c) => c.ballotStyleId === styleB.id && c.precinctId === precinctB
  );

  expect(rowA).toMatchObject({
    ballotStyleId: styleA.id,
    precinctId: precinctA,
    precinctCount: 2,
    absenteeCount: 1,
    totalCount: 3,
    languageCode: LanguageCode.ENGLISH,
  });
  expect(rowB).toMatchObject({
    ballotStyleId: styleB.id,
    precinctId: precinctB,
    precinctCount: 1,
    absenteeCount: 0,
    totalCount: 1,
    languageCode: LanguageCode.ENGLISH,
  });
});

test('end-to-end printing flow updates getBallotPrintCounts for primary election', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );

  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const { ballotStyles, parties } = electionDefinition.election;
  // Get two ballot styles from different parties
  const mammalParty = parties.find((p) => p.name === 'Mammal')!;
  const fishParty = parties.find((p) => p.name === 'Fish')!;

  const mammalStyle = ballotStyles.find((bs) => bs.partyId === mammalParty.id)!;
  const fishStyle = ballotStyles.find((bs) => bs.partyId === fishParty.id)!;
  const mammalPrecinctId = mammalStyle.precincts[0]!;
  const fishPrecinctId = fishStyle.precincts[0]!;

  // Print ballots for both parties
  await apiClient.printBallot({
    precinctId: mammalPrecinctId,
    partyId: mammalParty.id,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 2,
  });
  await apiClient.printBallot({
    precinctId: fishPrecinctId,
    partyId: fishParty.id,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Absentee,
    copies: 1,
  });

  const counts = await apiClient.getBallotPrintCounts();
  const mammalRow = counts.find(
    (c) =>
      c.ballotStyleId === mammalStyle.id && c.precinctId === mammalPrecinctId
  );
  const fishRow = counts.find(
    (c) => c.ballotStyleId === fishStyle.id && c.precinctId === fishPrecinctId
  );

  expect(mammalRow).toMatchObject({
    ballotStyleId: mammalStyle.id,
    precinctId: mammalPrecinctId,
    precinctCount: 2,
    absenteeCount: 0,
    totalCount: 2,
    languageCode: LanguageCode.ENGLISH,
    partyName: 'Mammal',
  });
  expect(fishRow).toMatchObject({
    ballotStyleId: fishStyle.id,
    precinctId: fishPrecinctId,
    precinctCount: 0,
    absenteeCount: 1,
    totalCount: 1,
    languageCode: LanguageCode.ENGLISH,
    partyName: 'Fish',
  });
});

test('end-to-end printing flow handles precinct splits correctly', async () => {
  // Use election with precinct splits - Precinct 4 has two splits
  const {
    primaryPrecinctSplitsMultiLangElectionDefinition,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
    ballots: primaryPrecinctSplitsMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const { parties } = primaryPrecinctSplitsMultiLangElectionDefinition.election;
  const mammalParty = parties.find((p) => p.name === 'Mammal')!;

  // Print a ballot for the precinct with splits (precinct-c2)
  // Using splitId to target a specific split
  await apiClient.printBallot({
    precinctId: 'precinct-c2',
    splitId: 'precinct-c2-split-1',
    partyId: mammalParty.id,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 1,
  });

  const counts = await apiClient.getBallotPrintCounts();

  // Find the row for the split - should have combined precinct/split name
  const splitRow = counts.find(
    (c) =>
      c.precinctId === 'precinct-c2' &&
      c.precinctOrSplitName.includes('Split 1')
  );

  expect(splitRow).toBeDefined();
  expect(splitRow).toMatchObject({
    precinctId: 'precinct-c2',
    precinctCount: 1,
    absenteeCount: 0,
    totalCount: 1,
    languageCode: LanguageCode.ENGLISH,
    partyName: 'Mammal',
  });
  // Verify the split name format: "Precinct Name - Split Name"
  expect(splitRow!.precinctOrSplitName).toMatch(/Precinct 4 - Split 1/);
});

async function expectPrintedJobsMatchBallotsInOrder({
  ballots,
  printJobHistoryPaths,
}: {
  ballots: ReadonlyArray<{ encodedBallot: string }>;
  printJobHistoryPaths: readonly string[];
}): Promise<void> {
  const expectedHashes = ballots.map((b) =>
    sha256(Buffer.from(b.encodedBallot, 'base64'))
  );
  const actualHashes = await Promise.all(
    printJobHistoryPaths.map(async (p) => sha256(await readFile(p)))
  );
  expect(actualHashes).toEqual(expectedHashes);
}

test('printAllBallotStyles prints every style and updates counts in a stable order', async () => {
  // Use primary election to cover party name sorting logic
  const {
    primaryPrecinctSplitsMultiLangElectionDefinition,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition: primaryPrecinctSplitsMultiLangElectionDefinition,
    ballots: primaryPrecinctSplitsMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const initialCounts = await apiClient.getBallotPrintCounts();
  expect(initialCounts.length).toBeGreaterThan(0);
  expect(initialCounts.every((c) => c.totalCount === 0)).toEqual(true);

  const ballotOrder = new Map<string, number>();
  const sortedCounts = [...initialCounts].sort((a, b) => {
    if (a.precinctOrSplitName !== b.precinctOrSplitName) {
      return a.precinctOrSplitName.localeCompare(b.precinctOrSplitName);
    }
    if (a.partyName && b.partyName) {
      return a.partyName.localeCompare(b.partyName);
    }
    return 0;
  });
  for (let i = 0; i < sortedCounts.length; i += 1) {
    const c = sortedCounts[i];
    ballotOrder.set(`${c.precinctId}-${c.ballotStyleId}`, i);
  }

  const allPrecinctBallots = (
    await apiClient.getBallots({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  )
    .slice()
    .sort(
      (a, b) =>
        assertDefined(ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`)) -
        assertDefined(ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`))
    );

  const jobsBeforePrecinct = mockPrinterHandler.getPrintJobHistory().length;
  await apiClient.printAllBallotStyles({
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copiesPerStyle: 1,
  });
  const jobsAfterPrecinct = mockPrinterHandler.getPrintJobHistory().length;
  expect(jobsAfterPrecinct - jobsBeforePrecinct).toEqual(
    allPrecinctBallots.length
  );

  await expectPrintedJobsMatchBallotsInOrder({
    ballots: allPrecinctBallots,
    printJobHistoryPaths: mockPrinterHandler
      .getPrintJobHistory()
      .slice(jobsBeforePrecinct, jobsAfterPrecinct)
      .map((j) => j.filename),
  });

  const countsAfterPrecinct = await apiClient.getBallotPrintCounts();
  for (const c of countsAfterPrecinct) {
    expect(c.precinctCount).toEqual(1);
    expect(c.absenteeCount).toEqual(0);
    expect(c.totalCount).toEqual(1);
  }

  const allAbsenteeBallots = (
    await apiClient.getBallots({
      ballotType: BallotType.Absentee,
      languageCode: LanguageCode.ENGLISH,
    })
  )
    .slice()
    .sort(
      (a, b) =>
        assertDefined(ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`)) -
        assertDefined(ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`))
    );

  const jobsBeforeAbsentee = mockPrinterHandler.getPrintJobHistory().length;
  await apiClient.printAllBallotStyles({
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Absentee,
    copiesPerStyle: 2,
  });
  const jobsAfterAbsentee = mockPrinterHandler.getPrintJobHistory().length;
  expect(jobsAfterAbsentee - jobsBeforeAbsentee).toEqual(
    allAbsenteeBallots.length
  );

  await expectPrintedJobsMatchBallotsInOrder({
    ballots: allAbsenteeBallots,
    printJobHistoryPaths: mockPrinterHandler
      .getPrintJobHistory()
      .slice(jobsBeforeAbsentee, jobsAfterAbsentee)
      .map((j) => j.filename),
  });

  const countsAfterAbsentee = await apiClient.getBallotPrintCounts();
  for (const c of countsAfterAbsentee) {
    expect(c.precinctCount).toEqual(1);
    expect(c.absenteeCount).toEqual(2);
    expect(c.totalCount).toEqual(3);
  }
});

test('getDistinctBallotStylesCount returns correct counts in official and test modes', async () => {
  const {
    famousNamesMultiLangElectionDefinition,
    famousNamesMultiLangOfficialAndTestBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition: famousNamesMultiLangElectionDefinition,
    ballots: famousNamesMultiLangOfficialAndTestBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  expect(
    await apiClient.getDistinctBallotStylesCount({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  ).toEqual(
    famousNamesMultiLangElectionDefinition.election.ballotStyles.length
  );

  await apiClient.setTestMode({ testMode: true });
  expect(
    await apiClient.getDistinctBallotStylesCount({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  ).toEqual(
    famousNamesMultiLangElectionDefinition.election.ballotStyles.length
  );
});

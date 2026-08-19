import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import {
  generateMarkOverlay,
  msGeneralElectionFixtures,
} from '@votingworks/hmpb';
import { assertDefined, err, ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BatteryInfo, mockElectionPackageFileTree } from '@votingworks/backend';
import {
  ballotPaperDimensions,
  BallotType,
  DEV_MACHINE_ID,
  EncodedBallotEntry,
  ElectionDefinition,
  ElectionPackageFileName,
  HmpbBallotPaperSize,
  LanguageCode,
  LATEST_METADATA,
  safeParseElectionDefinition,
  testCdfBallotDefinition,
  DEFAULT_SYSTEM_SETTINGS,
  anyPollingPlace,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  electionCombinedBallotPrimaryFixtures,
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LogEventId, MockLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  ELECTION_PACKAGE_FOLDER,
  generateElectionBasedSubfolderName,
  getFeatureFlagMock,
  getMockMultiLanguageElectionDefinition,
} from '@votingworks/utils';
import { zipFile } from '@votingworks/test-utils';
import {
  HP_4001_PRINTER_CONFIG,
  MemoryPrinterHandler,
  renderToPdf,
} from '@votingworks/printing';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { generateTestDeckBallots } from '@votingworks/test-decks';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  buildBallotsForElection,
} from '../test/app.js';
import { Api } from './app.js';
import { Workspace } from './util/workspace.js';

const mockFeatureFlagger = getFeatureFlagMock();
const EXPECTED_TALLY_REPORT_PAGES = 1;

let batteryInfo: BatteryInfo | null = null;

vi.mock(
  import('@votingworks/hmpb'),
  async (importActual): Promise<typeof import('@votingworks/hmpb')> => ({
    ...(await importActual()),
    generateMarkOverlay: vi.fn().mockResolvedValue(new Uint8Array()),
  })
);

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(
  import('@votingworks/printing'),
  async (importActual): Promise<typeof import('@votingworks/printing')> => ({
    ...(await importActual()),
    renderToPdf: vi.fn().mockResolvedValue(ok(new Uint8Array())),
  })
);

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

test('getSystemSettings returns defaults when no election is configured', async () => {
  expect(await apiClient.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);
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

  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;
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
  expect(result).toEqual(err({ type: 'no_election_package' }));
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
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionConfigured,
    expect.anything(),
    expect.objectContaining({ disposition: 'failure' })
  );
});

test('configureElectionPackageFromUsb cleans up when ballot streaming fails', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive({
    [generateElectionBasedSubfolderName(
      electionDefinition.election,
      electionDefinition.ballotHash
    )]: {
      [ELECTION_PACKAGE_FOLDER]: {
        'test-election-package.zip': await zipFile({
          [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
          [ElectionPackageFileName.METADATA]: JSON.stringify(LATEST_METADATA),
          [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(
            DEFAULT_SYSTEM_SETTINGS
          ),
          [ElectionPackageFileName.APP_STRINGS]: JSON.stringify({}),
          [ElectionPackageFileName.BALLOTS]: 'not a valid ballot line',
        }),
      },
    },
  });

  await expect(apiClient.configureElectionPackageFromUsb()).rejects.toThrow();
  expect(await apiClient.getElectionRecord()).toBeNull();
});

test('configureElectionPackageFromUsb auto-selects polling place for single-location election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.makeSinglePrecinctElectionDefinition();
  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;
  const ballots: EncodedBallotEntry[] = [
    {
      ballotStyleId,
      precinctId,
      ballotType: BallotType.Precinct,
      ballotMode: 'official',
      encodedBallot: Buffer.from('mock-pdf-data-for-test').toString('base64'),
    },
  ];
  const { election } = electionDefinition;
  const defaultPollingPlace = assertDefined(election.pollingPlaces?.[0]);

  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree({
      electionDefinition,
      ballots,
    })
  );

  const result = await apiClient.configureElectionPackageFromUsb();
  expect(result).toEqual(ok(expect.anything()));

  expect(await apiClient.getPollingPlaceId()).toEqual(defaultPollingPlace.id);
});

test('set polling place', async () => {
  const fixtures = electionFamousNames2021Fixtures;
  const electionDefinition = fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });

  expect(await apiClient.getPollingPlaceId()).toBeNull();

  await configureMachine({
    apiClient,
    auth,
    ballots,
    electionDefinition,
    mockUsbDrive,
  });

  expect(await apiClient.getPollingPlaceId()).toBeNull();

  const place = anyPollingPlace(electionDefinition.election);
  await apiClient.setPollingPlaceId({ id: place.id });
  expect(await apiClient.getPollingPlaceId()).toEqual(place.id);

  expect(logger.logAsCurrentRole).toHaveBeenLastCalledWith(
    LogEventId.PollingPlaceChanged,
    {
      disposition: 'success',
      message: `User set the polling place for the machine to ${place.name}`,
    }
  );
});

test('mode toggling', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official', 'test'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  expect(await apiClient.getTestMode()).toEqual(false);
  expect(await apiClient.hasTestBallots()).toEqual(true);

  await apiClient.setTestMode({ testMode: true });
  expect(await apiClient.getTestMode()).toEqual(true);
  expect(await apiClient.getBallots({})).not.toHaveLength(0);
  expect(await apiClient.getBallotPrintCounts()).not.toHaveLength(0);
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

test('cannot switch to test mode when the election package has no test ballots', async () => {
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

  expect(await apiClient.hasTestBallots()).toEqual(false);
  expect(await apiClient.getTestMode()).toEqual(false);

  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);
  await apiClient.printBallot({
    precinctId: electionDefinition.election.ballotStyles[0].precincts[0],
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 1,
  });
  const printCounts = await apiClient.getBallotPrintCounts();
  expect(printCounts.some((count) => count.totalCount > 0)).toEqual(true);

  await expect(apiClient.setTestMode({ testMode: true })).rejects.toThrow(
    'Cannot switch to test ballot mode: the election package does not contain test ballots.'
  );
  expect(await apiClient.getTestMode()).toEqual(false);
  // The rejected switch must not have reset the print counts.
  expect(await apiClient.getBallotPrintCounts()).toEqual(printCounts);

  // Switching to official mode is always allowed.
  await apiClient.setTestMode({ testMode: false });
  expect(await apiClient.getTestMode()).toEqual(false);
});

test('unconfigureMachine clears election configuration', async () => {
  // Test with a cdf election for coverage
  const electionDefinition = safeParseElectionDefinition(
    JSON.stringify(testCdfBallotDefinition)
  ).unsafeUnwrap();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official', 'test'],
  });
  await configureMachine({
    electionDefinition,
    ballots,
    apiClient,
    auth,
    mockUsbDrive,
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
  });

  expect(await apiClient.getElectionRecord()).not.toBeNull();

  await apiClient.setTestMode({ testMode: true });

  expect(await apiClient.getPollingPlaceId()).not.toBeNull();
  expect(await apiClient.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  await apiClient.unconfigureMachine();

  expect(await apiClient.getElectionRecord()).toBeNull();
  expect(await apiClient.getPollingPlaceId()).toBeNull();
  expect(await apiClient.getBallots({})).toEqual([]);
  expect(await apiClient.getTestMode()).toEqual(false);
  expect(workspace.store.getSystemSettings()).toBeUndefined();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ElectionUnconfigured,
    expect.anything(),
    expect.objectContaining({ disposition: 'success' })
  );
});

test('end-to-end printing flow updates getBallotPrintCounts', async () => {
  const {
    famousNamesMultiLangElectionDefinition: electionDefinition,
    famousNamesMultiLangOfficialBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition,
    ballots: famousNamesMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { ballotStyles } = electionDefinition.election;
  const styleA = ballotStyles[0];
  const styleB = ballotStyles[1];
  const precinctA = styleA.precincts[0];
  const precinctB = styleB.precincts[0];

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
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { ballotStyles, parties } = electionDefinition.election;
  // Get two ballot styles from different parties
  const mammalParty = parties.find((p) => p.name === 'Mammal')!;
  const fishParty = parties.find((p) => p.name === 'Fish')!;

  const mammalStyle = ballotStyles.find((bs) => bs.partyId === mammalParty.id)!;
  const fishStyle = ballotStyles.find((bs) => bs.partyId === fishParty.id)!;
  const mammalPrecinctId = mammalStyle.precincts[0];
  const fishPrecinctId = fishStyle.precincts[0];

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

test('end-to-end printing flow handles combined ballot primary (consolidated ballots)', async () => {
  // In a combined ballot primary, ballots are consolidated (all parties' contests on one
  // ballot) and ballot styles have no partyId. VxPrint should print without a
  // party selection, just like a general election.
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionCombinedBallotPrimaryFixtures.readElectionDefinition(),
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
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { ballotStyles } = electionDefinition.election;
  const ballotStyle = ballotStyles[0];
  const precinctId = ballotStyle.precincts[0];

  // Print with no partyId, matching what the frontend sends for combined ballot primaries.
  await apiClient.printBallot({
    precinctId,
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copies: 2,
  });

  const counts = await apiClient.getBallotPrintCounts();
  const row = counts.find(
    (c) => c.ballotStyleId === ballotStyle.id && c.precinctId === precinctId
  );
  expect(row).toMatchObject({
    ballotStyleId: ballotStyle.id,
    precinctId,
    precinctCount: 2,
    absenteeCount: 0,
    totalCount: 2,
    languageCode: LanguageCode.ENGLISH,
    partyName: undefined,
  });
});

test('printAllBallotStyles works for combined ballot primary (consolidated ballots)', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionCombinedBallotPrimaryFixtures.readElectionDefinition(),
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
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  await apiClient.printAllBallotStyles({
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copiesPerStyle: 1,
  });

  const counts = await apiClient.getBallotPrintCounts();
  expect(counts.length).toEqual(
    electionDefinition.election.ballotStyles.length
  );
  for (const count of counts) {
    expect(count.partyName).toBeUndefined();
    expect(count.totalCount).toEqual(1);
  }
});

test('end-to-end printing flow handles precinct splits correctly', async () => {
  // Use election with precinct splits - Precinct 4 has two splits
  const {
    primaryPrecinctSplitsMultiLangElectionDefinition: electionDefinition,
    primaryPrecinctSplitsMultiLangOfficialBallots,
  } = sharedFixtures;

  await configureMachine({
    electionDefinition,
    ballots: primaryPrecinctSplitsMultiLangOfficialBallots,
    apiClient,
    auth,
    mockUsbDrive,
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { parties } = electionDefinition.election;
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
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

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

// Build test ballot entries for every (ballotStyleId, precinctId) combination in
// the election, necessary for test deck tests.
async function buildTestBallotsForElection(
  electionDefinition: ElectionDefinition
): Promise<EncodedBallotEntry[]> {
  const { election } = electionDefinition;
  const pdfBase64s = await (async () => {
    // Reuse the same ballot PDFs as buildBallotsForElection
    const { resolve, join } = await import('node:path');
    const baseDir = resolve(
      process.cwd(),
      '../../../libs/hmpb/fixtures/vx-famous-names'
    );
    const pdfs = await Promise.all([
      readFile(join(baseDir, 'blank-ballot.pdf')),
      readFile(join(baseDir, 'marked-ballot.pdf')),
      readFile(join(baseDir, 'blank-official-ballot.pdf')),
      readFile(join(baseDir, 'marked-official-ballot.pdf')),
    ]);
    return pdfs.map((p) => p.toString('base64'));
  })();

  const entries: EncodedBallotEntry[] = [];
  let index = 0;
  for (const ballotStyle of election.ballotStyles) {
    for (const precinctId of ballotStyle.precincts) {
      const encodedBallot = pdfBase64s[index % pdfBase64s.length];
      index += 1;
      entries.push(
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode: 'test',
          encodedBallot,
        },
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode: 'test',
          encodedBallot,
        }
      );
    }
  }
  return entries;
}

async function makeMsElectionDefinition(): Promise<ElectionDefinition> {
  return safeParseElectionDefinition(
    await readFile(msGeneralElectionFixtures.electionPath, 'utf-8')
  ).unsafeUnwrap();
}

test('getTestDeckBallotCount returns 0 when election has no gridLayouts', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
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

  expect(await apiClient.getTestDeckBallotCount({})).toEqual(0);
});

test('getTestDeckBallotCount returns total number of test deck specs across all precincts', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  const { election } = msElectionDef;
  const allSpecs = election.precincts.flatMap((precinct) =>
    generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    })
  );
  expect(await apiClient.getTestDeckBallotCount({})).toEqual(allSpecs.length);
});

test('getTestDeckBallotCount returns count for a single precinct when precinctId is provided', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });

  const { election } = msElectionDef;
  const precinct = assertDefined(election.precincts[0]);

  const precinctSpecs = generateTestDeckBallots({
    election,
    precinctId: precinct.id,
    ballotFormat: 'bubble',
  });
  expect(
    await apiClient.getTestDeckBallotCount({ precinctId: precinct.id })
  ).toEqual(precinctSpecs.length);
});

test('printTestDeck sends one print job per spec and calls generateMarkOverlay only for non-blank ballots', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setTestMode({ testMode: true });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { election } = msElectionDef;
  const allSpecs = election.precincts.flatMap((precinct) =>
    generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    })
  );
  const nonBlankSpecCount = allSpecs.filter(
    (spec) => Object.keys(spec.votes).length > 0
  ).length;

  vi.mocked(generateMarkOverlay).mockClear();
  await apiClient.printTestDeck({});
  const jobs = mockPrinterHandler.getPrintJobHistory();
  expect(jobs.length).toEqual(
    // Ballots + an overall tally report + one tally report per precinct
    allSpecs.length +
      EXPECTED_TALLY_REPORT_PAGES * (1 + election.precincts.length)
  );
  expect(vi.mocked(generateMarkOverlay)).toHaveBeenCalledTimes(
    nonBlankSpecCount
  );
});

test('printTestDeck prints only the given precinct and a precinct-specific tally report when precinctId is provided', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setTestMode({ testMode: true });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { election } = msElectionDef;
  const precinct = assertDefined(election.precincts[0]);

  const precinctSpecs = generateTestDeckBallots({
    election,
    precinctId: precinct.id,
    ballotFormat: 'bubble',
  });

  await apiClient.printTestDeck({ precinctId: precinct.id });
  const jobs = mockPrinterHandler.getPrintJobHistory();
  expect(jobs.length).toEqual(
    precinctSpecs.length + EXPECTED_TALLY_REPORT_PAGES
  );
});

test('getTestDeckBallotCount returns 0 when no election is configured', async () => {
  expect(await apiClient.getTestDeckBallotCount({})).toEqual(0);
});

test('count and print exclude specs with no matching stored ballot', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const officialOnlyBallots = await buildBallotsForElection({
    electionDefinition: msElectionDef,
    ballotModes: ['official'],
  });
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: officialOnlyBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  // Expect no ballot counts because the only ballots on the machine are official,
  // but test deck counts consider only test mode ballots.
  expect(await apiClient.getTestDeckBallotCount({})).toEqual(0);

  await apiClient.printTestDeck({});
  // Only tally reports print; every ballot spec is filtered out. An overall
  // tally report plus one per precinct.
  expect(mockPrinterHandler.getPrintJobHistory().length).toEqual(
    EXPECTED_TALLY_REPORT_PAGES * (1 + msElectionDef.election.precincts.length)
  );
});

test('printTestDeck prints test ballots when machine is in official ballot mode', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  const { election } = msElectionDef;
  const allSpecs = election.precincts.flatMap((precinct) =>
    generateTestDeckBallots({
      election,
      precinctId: precinct.id,
      ballotFormat: 'bubble',
    })
  );

  await apiClient.printTestDeck({});
  const jobsAfter = mockPrinterHandler.getPrintJobHistory().length;
  expect(jobsAfter).toEqual(
    allSpecs.length +
      EXPECTED_TALLY_REPORT_PAGES * (1 + election.precincts.length)
  );
});

test('printTestDeck with overallTallyReportOnly prints only the overall tally report', async () => {
  const msElectionDef = await makeMsElectionDefinition();
  const msBallots = await buildTestBallotsForElection(msElectionDef);
  await configureMachine({
    electionDefinition: msElectionDef,
    ballots: msBallots,
    apiClient,
    auth,
    mockUsbDrive,
  });
  await apiClient.setTestMode({ testMode: true });
  mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

  vi.mocked(renderToPdf).mockClear();
  await apiClient.printTestDeck({ overallTallyReportOnly: true });

  // No ballots and no per-precinct reports, just the overall tally report
  expect(vi.mocked(renderToPdf)).toHaveBeenCalledOnce();
  expect(mockPrinterHandler.getPrintJobHistory().length).toEqual(
    EXPECTED_TALLY_REPORT_PAGES
  );
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.PrinterPrintRequest,
    expect.objectContaining({
      message: 'Printed test deck',
      disposition: 'success',
      ballotCount: 0,
    })
  );
});

test.each([
  HmpbBallotPaperSize.Letter,
  HmpbBallotPaperSize.Legal,
  HmpbBallotPaperSize.Custom17,
  HmpbBallotPaperSize.Custom18,
  HmpbBallotPaperSize.Custom19,
  HmpbBallotPaperSize.Custom20,
  HmpbBallotPaperSize.Custom22,
])(
  'printTestDeck tally report uses correct paper dimensions for %s election',
  async (paperSize) => {
    const electionJson = JSON.parse(
      await readFile(msGeneralElectionFixtures.electionPath, 'utf-8')
    );
    electionJson.ballotLayout.paperSize = paperSize;
    const electionDef = safeParseElectionDefinition(
      JSON.stringify(electionJson)
    ).unsafeUnwrap();

    const ballots = await buildTestBallotsForElection(electionDef);
    await configureMachine({
      electionDefinition: electionDef,
      ballots,
      apiClient,
      auth,
      mockUsbDrive,
    });
    await apiClient.setTestMode({ testMode: true });
    mockPrinterHandler.connectPrinter(HP_4001_PRINTER_CONFIG);

    vi.mocked(renderToPdf).mockClear();
    await apiClient.printTestDeck({});

    expect(vi.mocked(renderToPdf)).toHaveBeenCalledTimes(
      // An overall tally report plus one per precinct
      1 + electionDef.election.precincts.length
    );
    for (const call of vi.mocked(renderToPdf).mock.calls) {
      expect(call[0]).toMatchObject({
        paperDimensions: ballotPaperDimensions(paperSize),
      });
    }
  }
);

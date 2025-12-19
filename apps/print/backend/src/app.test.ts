import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ok } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BatteryInfo } from '@votingworks/backend';
import {
  BallotType,
  DEV_MACHINE_ID,
  EncodedBallotEntry,
  ElectionDefinition,
  LanguageCode,
  PrinterStatus,
  safeParseJson,
  SystemSettingsSchema,
} from '@votingworks/types';
import {
  electionFamousNames2021Fixtures,
  systemSettings,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
  getMockMultiLanguageElectionDefinition,
  generateFileTimeSuffix,
} from '@votingworks/utils';
import {
  getMockConnectedPrinterStatus,
  HP_LASER_PRINTER_CONFIG,
} from '@votingworks/printing';
import { Server } from 'node:http';
import { mockElectionPackageFileTree } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import { MockLogger } from '@votingworks/logging';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { MemoryPrinterHandler } from '@votingworks/printing';
import {
  buildTestEnvironment,
  configureFromUsb,
  mockElectionManagerAuth,
} from '../test/app';
import { Api } from './app';
import { Workspace } from './util/workspace';
import {
  exportBallotsPrintedReportPdf,
  generateReportsDirectoryPath,
  printBallotsPrintedReport,
} from './reports/ballots_printed_report';

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

async function getFamousNamesBallotPdfBase64s(): Promise<
  readonly [string, string, string, string]
> {
  const baseDir = resolve(
    process.cwd(),
    '../../../libs/hmpb/fixtures/vx-famous-names'
  );
  const [pdf1, pdf2, pdf3, pdf4] = await Promise.all([
    readFile(join(baseDir, 'blank-ballot.pdf')),
    readFile(join(baseDir, 'marked-ballot.pdf')),
    readFile(join(baseDir, 'blank-official-ballot.pdf')),
    readFile(join(baseDir, 'marked-official-ballot.pdf')),
  ]);
  return [
    pdf1.toString('base64'),
    pdf2.toString('base64'),
    pdf3.toString('base64'),
    pdf4.toString('base64'),
  ] as const;
}

async function buildBallotsForElection({
  electionDefinition,
  ballotModes,
}: {
  electionDefinition: ElectionDefinition;
  ballotModes: ReadonlyArray<'official' | 'test'>;
}): Promise<EncodedBallotEntry[]> {
  const {ballotStyles} = electionDefinition.election;
  const pdfBase64s = await getFamousNamesBallotPdfBase64s();

  const ballots: EncodedBallotEntry[] = [];
  for (const [index, ballotStyle] of ballotStyles.entries()) {
    const precinctId = ballotStyle.precincts[0];
    if (!precinctId) {
      throw new Error(`Ballot style ${ballotStyle.id} has no precincts`);
    }
    const encodedBallot = pdfBase64s[index % pdfBase64s.length];
    for (const ballotMode of ballotModes) {
      ballots.push(
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Precinct,
          ballotMode,
          encodedBallot,
        },
        {
          ballotStyleId: ballotStyle.id,
          precinctId,
          ballotType: BallotType.Absentee,
          ballotMode,
          encodedBallot,
        }
      );
    }
  }

  return ballots;
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

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

  mockUsbDrive.usbDrive.eject.assertComplete();
});

test('configureElectionPackageFromUsb reads to and writes from store', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();

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
      systemSettings: parsedSystemSettings,
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

test('setting precinct', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  expect(await apiClient.getPrecinctSelection()).toBeNull();
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: safeParseJson(
      systemSettings.asText(),
      SystemSettingsSchema
    ).unsafeUnwrap(),
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

test('mode', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: safeParseJson(
      systemSettings.asText(),
      SystemSettingsSchema
    ).unsafeUnwrap(),
  });

  expect(await apiClient.getTestMode()).toEqual(false);

  await apiClient.setTestMode({ testMode: true });
  expect(await apiClient.getTestMode()).toEqual(true);
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
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: safeParseJson(
      systemSettings.asText(),
      SystemSettingsSchema
    ).unsafeUnwrap(),
  });

  // Ensure we have some additional state to clear.
  expect(await apiClient.getElectionRecord()).not.toBeNull();
  expect(await apiClient.getBallots({})).not.toHaveLength(0);

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

test('end-to-end printing flow updates getBallotPrintCounts', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();

  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: parsedSystemSettings,
    ballots,
  });

  await apiClient.setPrecinctSelection({
    precinctSelection: ALL_PRECINCTS_SELECTION,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const {ballotStyles} = electionDefinition.election;
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

  const counts = await apiClient.getBallotPrintCounts({});
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

test('printAllBallotStyles prints every style and updates counts in a stable order', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();

  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: parsedSystemSettings,
    ballots,
  });
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  const initialCounts = await apiClient.getBallotPrintCounts({});
  expect(initialCounts.length).toBeGreaterThan(0);
  expect(initialCounts.every((c) => c.totalCount === 0)).toEqual(true);

  // Expected print order is derived from precinct/split name and party name.
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

  const ballotsPrecinct = (
    await apiClient.getBallots({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  )
    .slice()
    .sort(
      (a, b) =>
        (ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`) ?? 0) -
        (ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`) ?? 0)
    );

  const jobsBeforePrecinct = mockPrinterHandler.getPrintJobHistory().length;
  await apiClient.printAllBallotStyles({
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Precinct,
    copiesPerStyle: 1,
  });
  const jobsAfterPrecinct = mockPrinterHandler.getPrintJobHistory().length;
  expect(jobsAfterPrecinct - jobsBeforePrecinct).toEqual(
    ballotsPrecinct.length
  );

  await expectPrintedJobsMatchBallotsInOrder({
    ballots: ballotsPrecinct,
    printJobHistoryPaths: mockPrinterHandler
      .getPrintJobHistory()
      .slice(jobsBeforePrecinct, jobsAfterPrecinct)
      .map((j) => j.filename),
  });

  const countsAfterPrecinct = await apiClient.getBallotPrintCounts({});
  for (const c of countsAfterPrecinct) {
    expect(c.precinctCount).toEqual(1);
    expect(c.absenteeCount).toEqual(0);
    expect(c.totalCount).toEqual(1);
  }

  const ballotsAbsentee = (
    await apiClient.getBallots({
      ballotType: BallotType.Absentee,
      languageCode: LanguageCode.ENGLISH,
    })
  )
    .slice()
    .sort(
      (a, b) =>
        (ballotOrder.get(`${a.precinctId}-${a.ballotStyleId}`) ?? 0) -
        (ballotOrder.get(`${b.precinctId}-${b.ballotStyleId}`) ?? 0)
    );

  const jobsBeforeAbsentee = mockPrinterHandler.getPrintJobHistory().length;
  await apiClient.printAllBallotStyles({
    languageCode: LanguageCode.ENGLISH,
    ballotType: BallotType.Absentee,
    copiesPerStyle: 2,
  });
  const jobsAfterAbsentee = mockPrinterHandler.getPrintJobHistory().length;
  expect(jobsAfterAbsentee - jobsBeforeAbsentee).toEqual(
    ballotsAbsentee.length
  );

  await expectPrintedJobsMatchBallotsInOrder({
    ballots: ballotsAbsentee,
    printJobHistoryPaths: mockPrinterHandler
      .getPrintJobHistory()
      .slice(jobsBeforeAbsentee, jobsAfterAbsentee)
      .map((j) => j.filename),
  });

  const countsAfterAbsentee = await apiClient.getBallotPrintCounts({});
  for (const c of countsAfterAbsentee) {
    expect(c.precinctCount).toEqual(1);
    expect(c.absenteeCount).toEqual(2);
    expect(c.totalCount).toEqual(3);
  }
});

test('getDistinctBallotStylesCount returns correct counts in official and test modes', async () => {
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();

  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official', 'test'],
  });
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: parsedSystemSettings,
    ballots,
  });

  expect(
    await apiClient.getDistinctBallotStylesCount({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  ).toEqual(electionDefinition.election.ballotStyles.length);

  await apiClient.setTestMode({ testMode: true });
  expect(
    await apiClient.getDistinctBallotStylesCount({
      ballotType: BallotType.Precinct,
      languageCode: LanguageCode.ENGLISH,
    })
  ).toEqual(electionDefinition.election.ballotStyles.length);
});

test('ballots printed report (zero) can be printed and exported (pdf snapshots)', async () => {
  const fixedNow = new Date('2025-12-18T12:00:00.000Z');
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: parsedSystemSettings,
    ballots,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await printBallotsPrintedReport({
    printer: mockPrinterHandler.printer,
    logger,
    store: workspace.store,
    generatedAtTime: fixedNow,
  });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'ballots-printed-report-zero-print',
  });

  await exportBallotsPrintedReportPdf({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    store: workspace.store,
    generatedAtTime: fixedNow,
  });
  const usbStatus = await mockUsbDrive.usbDrive.status();
  expect(usbStatus.status).toEqual('mounted');
  const {mountPoint} = (usbStatus as { status: 'mounted'; mountPoint: string });

  const reportsDir = join(
    mountPoint,
    generateReportsDirectoryPath(electionDefinition)
  );
  const exportedFilename = `ballots-printed-report__${generateFileTimeSuffix(
    fixedNow
  )}.pdf`;
  await expect(join(reportsDir, exportedFilename)).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'ballots-printed-report-zero-export',
  });
}, 30_000);

test('ballots printed report (non-zero) can be printed and exported (pdf snapshots)', async () => {
  const fixedNow = new Date('2025-12-18T12:05:00.000Z');
  const electionDefinition = getMockMultiLanguageElectionDefinition(
    electionFamousNames2021Fixtures.readElectionDefinition(),
    [LanguageCode.ENGLISH]
  );
  const parsedSystemSettings = safeParseJson(
    systemSettings.asText(),
    SystemSettingsSchema
  ).unsafeUnwrap();
  const ballots = await buildBallotsForElection({
    electionDefinition,
    ballotModes: ['official'],
  });
  await configureFromUsb(apiClient, auth, mockUsbDrive, {
    electionDefinition,
    systemSettings: parsedSystemSettings,
    ballots,
  });

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  const styleA = electionDefinition.election.ballotStyles[0]!;
  const precinctA = styleA.precincts[0]!;
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

  await printBallotsPrintedReport({
    printer: mockPrinterHandler.printer,
    logger,
    store: workspace.store,
    generatedAtTime: fixedNow,
  });
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'ballots-printed-report-nonzero-print',
  });

  await exportBallotsPrintedReportPdf({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    store: workspace.store,
    generatedAtTime: fixedNow,
  });
  const usbStatus = await mockUsbDrive.usbDrive.status();
  expect(usbStatus.status).toEqual('mounted');
  const {mountPoint} = (usbStatus as { status: 'mounted'; mountPoint: string });
  const reportsDir = join(
    mountPoint,
    generateReportsDirectoryPath(electionDefinition)
  );
  const exportedFilename = `ballots-printed-report__${generateFileTimeSuffix(
    fixedNow
  )}.pdf`;
  await expect(join(reportsDir, exportedFilename)).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'ballots-printed-report-nonzero-export',
  });
}, 30_000);

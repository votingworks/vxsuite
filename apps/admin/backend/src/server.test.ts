import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assert } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { AddressInfo } from 'node:net';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { Server } from 'node:http';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { testDetectDevices } from '@votingworks/backend';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { createMockMultiUsbDrive } from '@votingworks/usb-drive';
import { createMockPrinterHandler } from '@votingworks/printing';
import { start } from './server.js';
import { createWorkspace } from './util/workspace.js';
import { PORT } from './globals.js';
import { importCastVoteRecords } from './cast_vote_records.js';
import { writeMachineMode } from './machine_mode.js';
import { startHostNetworking, startClientNetworking } from './networking.js';

// Mock modules that start() creates or calls internally
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock('@votingworks/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@votingworks/auth')>();
  return {
    ...actual,
    DippedSmartCardAuth: vi
      .fn()
      .mockImplementation(() => actual.buildMockDippedSmartCardAuth(vi.fn)),
    // Mock card classes to prevent pcsclite from being initialized (not
    // available in CI).
    JavaCard: vi.fn(),
    MockFileCard: vi.fn(),
    manageOpensslConfig: vi.fn(),
  };
});

vi.mock('@votingworks/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@votingworks/backend')>();
  return {
    ...actual,
    startCpuMetricsLogging: vi.fn(),
  };
});

vi.mock('@votingworks/dev-dock-backend', () => ({
  useDevDockRouter: vi.fn(),
}));

vi.mock('./networking.js', () => ({
  startHostNetworking: vi.fn(),
  startClientNetworking: vi.fn(),
}));

let server: Server | undefined;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  server?.close();
  server = undefined;
});

test('starts with default logger and port', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
    })
  );

  const address = server.address() as AddressInfo;
  expect(address.port).toEqual(PORT);
});

test('start with config options', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
      port: 3005,
    })
  );

  const address = server.address() as AddressInfo;
  expect(address.port).toEqual(3005);
  expect(logger.log).toHaveBeenCalled();
});

test('errors on start with no workspace', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });

  try {
    await suppressingConsoleOutput(() =>
      start({
        logger,
      })
    );
  } catch (err: unknown) {
    assert(err instanceof Error);
    expect(err.message).toMatch(
      'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.WorkspaceConfigurationMessage,
      'system',
      {
        message: expect.stringContaining(
          'workspace path could not be determined'
        ),
        disposition: 'failure',
      }
    );
  }
});

test('logs device attach/un-attach events', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
      port: 0,
    })
  );

  testDetectDevices(logger, expect);
});

test('logs when no election results data present at startup', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
    })
  );

  const address = server.address() as AddressInfo;
  expect(address.port).toEqual(PORT);

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'No election results data is present in the database at machine startup.',
      numCvrFiles: 0,
      numManualResults: 0,
    }
  );
});

test('logs when there is stored election results data present at startup', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  // Add CVRs to db
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const electionId = workspace.store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  workspace.store.setCurrentElectionId(electionId);
  const importResult = await importCastVoteRecords(
    workspace.store,
    castVoteRecordExport.asDirectoryPath(),
    logger
  );
  importResult.assertOk('Unexpected failure to import CVR fixture');

  // Add manual result to db
  workspace.store.setManualResults({
    electionId,
    precinctId: election.precincts[0]!.id,
    ballotStyleGroupId: election.ballotStyles[0]!.groupId,
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 10,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 10,
          },
        },
      },
    }),
  });

  server = await suppressingConsoleOutput(() =>
    start({ workspacePath: workspace.path, logger, multiUsbDrive, printer })
  );

  const address = server.address() as AddressInfo;
  expect(address.port).toEqual(PORT);

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'Election results data is present in the database at machine startup.',
      numCvrFiles: 1,
      numManualResults: 1,
    }
  );
});

test('does not start networking in host mode without multi-station enabled', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
      port: 0,
    })
  );

  expect(startHostNetworking).not.toHaveBeenCalled();
  expect(startClientNetworking).not.toHaveBeenCalled();
});

test('starts host networking and peer server when multi-station is enabled', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  const { multiUsbDrive } = createMockMultiUsbDrive();
  const { printer } = createMockPrinterHandler();

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  const peerPort = 0;
  server = await suppressingConsoleOutput(() =>
    start({
      workspacePath: makeTemporaryDirectory(),
      logger,
      multiUsbDrive,
      printer,
      port: 0,
      peerPort,
    })
  );

  expect(startHostNetworking).toHaveBeenCalledWith(
    expect.objectContaining({ peerPort })
  );
  expect(startClientNetworking).not.toHaveBeenCalled();

  // Peer app logs ApplicationStartup when listening
  await vi.waitFor(() => {
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ApplicationStartup,
      'system',
      expect.objectContaining({
        message: expect.stringContaining('Peer API server running'),
      })
    );
  });

  featureFlagMock.resetFeatureFlags();
});

test('starts client networking in client mode', async () => {
  const workspacePath = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });

  writeMachineMode(workspacePath, 'client');

  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_MULTI_STATION_ADMIN
  );

  server = await suppressingConsoleOutput(() =>
    start({ workspacePath, logger, port: 0 })
  );

  expect(startClientNetworking).toHaveBeenCalled();
  expect(startHostNetworking).not.toHaveBeenCalled();

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'No election results data is present in the database at machine startup.',
      numCvrFiles: 0,
      numManualResults: 0,
    }
  );

  featureFlagMock.resetFeatureFlags();
});

import { beforeEach, expect, test, vi } from 'vitest';
import { assert } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { Server } from 'node:http';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { createMockPrinterHandler } from '@votingworks/printing';
import { testDetectDevices } from '@votingworks/backend';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { buildManualResultsFixture } from '@votingworks/utils';
import { start } from './server';
import { createWorkspace } from './util/workspace';
import { PORT } from './globals';
import { buildApp } from './app';
import { buildMockLogger } from '../test/app';
import { importCastVoteRecords } from './cast_vote_records';

beforeEach(() => {
  vi.clearAllMocks();
});

test('starts with default logger and port', async () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  await start({ app, workspace });

  expect(app.listen).toHaveBeenCalledWith(PORT, expect.anything());

  // eslint-disable-next-line no-console
  expect(console.log).toHaveBeenCalled();
});

test('start with config options', async () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  await start({ app, workspace, port: 3005, logger });

  expect(app.listen).toHaveBeenCalledWith(3005, expect.anything());
  expect(logger.log).toHaveBeenCalled();
});

test('errors on start with no workspace', async () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

  // start up the server
  try {
    await start({
      app,
      workspace: undefined,
      logger,
    });
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
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  await start({ app, workspace, port: 3005, logger });

  testDetectDevices(logger, expect);
});

test('logs when no election results data present at startup', async () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  await start({ app, workspace, logger });

  expect(app.listen).toHaveBeenCalledWith(PORT, expect.anything());

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'No election results data is present in the database at machine startup.',
    }
  );

  // eslint-disable-next-line no-console
  expect(console.log).toHaveBeenCalled();
});

test('logs when there is stored election results data present at startup', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const candidateContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const { printer } = createMockPrinterHandler();
  const app = buildApp({ auth, workspace, logger, usbDrive, printer });

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

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  await start({ app, workspace, logger });

  expect(app.listen).toHaveBeenCalledWith(PORT, expect.anything());

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

  // eslint-disable-next-line no-console
  expect(console.log).toHaveBeenCalled();
});

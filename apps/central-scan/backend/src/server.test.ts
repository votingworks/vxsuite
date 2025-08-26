import { expect, test, vi } from 'vitest';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { v4 as uuid } from 'uuid';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { testDetectDevices } from '@votingworks/backend';
import { Server } from 'node:http';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { createWorkspace } from './util/workspace';
import { buildMockLogger } from '../test/helpers/setup_app';
import { makeMockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { buildCentralScannerApp } from './app';
import { start } from './server';

test('logs device attach/un-attach events', () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, logger, scanner });
  const app = buildCentralScannerApp({
    auth,
    workspace,
    logger,
    usbDrive,
    scanner,
    importer,
  });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  start({ app, workspace, port: 3005, logger });

  testDetectDevices(logger, expect);
});

test('logs when sheet counts are present at startup', () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );

  expect(workspace.store.getBallotsCounted()).toEqual(0);
  // Create a batch and add a sheet to it
  const batchId = workspace.store.addBatch();
  workspace.store.addSheet(uuid(), batchId, [
    {
      imagePath: '/tmp/front-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);
  expect(workspace.store.getBallotsCounted()).toEqual(1);

  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, logger, scanner });
  const app = buildCentralScannerApp({
    auth,
    workspace,
    logger,
    usbDrive,
    scanner,
    importer,
  });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  start({ app, workspace, port: 3005, logger });

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'Scanned ballot data is present in the database at machine startup.',
      sheetCount: 1,
    }
  );
});

test('logs when sheet counts are not present at startup', () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    makeTemporaryDirectory(),
    mockBaseLogger({ fn: vi.fn })
  );
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, logger, scanner });
  const app = buildCentralScannerApp({
    auth,
    workspace,
    logger,
    usbDrive,
    scanner,
    importer,
  });

  // don't actually listen
  vi.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  vi.spyOn(console, 'log').mockReturnValue();

  // start up the server
  start({ app, workspace, port: 3005, logger });

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'No scanned ballot data is present in the database at machine startup.',
      sheetCount: 0,
    }
  );
});

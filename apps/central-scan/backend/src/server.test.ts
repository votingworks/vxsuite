import { expect, test, vi } from 'vitest';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { testDetectDevices } from '@votingworks/backend';
import { Server } from 'node:http';
import { mockBaseLogger } from '@votingworks/logging';
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

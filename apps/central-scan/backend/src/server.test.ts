import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { dirSync } from 'tmp';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { testDetectDevices } from '@votingworks/backend';
import { Server } from 'node:http';
import { mockBaseLogger } from '@votingworks/logging';
import { createSimpleRenderer } from '@votingworks/printing';
import { createWorkspace } from './util/workspace';
import { buildMockLogger } from '../test/helpers/setup_app';
import { makeMockScanner } from '../test/util/mocks';
import { Importer } from './importer';
import { buildCentralScannerApp } from './app';
import { start } from './server';

test('logs device attach/un-attach events', async () => {
  const auth = buildMockDippedSmartCardAuth();
  const workspace = createWorkspace(dirSync().name, mockBaseLogger());
  const logger = buildMockLogger(auth, workspace);
  const { usbDrive } = createMockUsbDrive();
  const scanner = makeMockScanner();
  const importer = new Importer({ workspace, logger, scanner });
  const renderer = await createSimpleRenderer();
  const app = buildCentralScannerApp({
    auth,
    workspace,
    logger,
    usbDrive,
    scanner,
    importer,
    renderer,
  });

  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.();
    return undefined as unknown as Server;
  });
  jest.spyOn(console, 'log').mockImplementation();

  // start up the server
  await start({ app, workspace, port: 3005, logger });

  testDetectDevices(logger);
});

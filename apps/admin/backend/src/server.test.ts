import { beforeEach, expect, test, vi } from 'vitest';
import { assert } from '@votingworks/basics';

import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { Server } from 'node:http';
import { dirSync } from 'tmp';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import { createMockPrinterHandler } from '@votingworks/printing';
import { testDetectDevices } from '@votingworks/backend';
import { start } from './server';
import { createWorkspace } from './util/workspace';
import { PORT } from './globals';
import { buildApp } from './app';
import { buildMockLogger } from '../test/app';

beforeEach(() => {
  vi.clearAllMocks();
});

test('starts with default logger and port', async () => {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspace = createWorkspace(
    dirSync().name,
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
    dirSync().name,
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
    dirSync().name,
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
    dirSync().name,
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

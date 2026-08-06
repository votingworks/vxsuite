import {
  beforeEach,
  expect,
  test,
  vi,
  MockedFunction,
  afterEach,
} from 'vitest';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { Application } from 'express';
import { start } from './server.js';
import { createWorkspace, Workspace } from './util/workspace.js';
import { PORT } from './globals.js';
import { buildApp } from './app.js';

vi.mock('./app');
let workspace!: Workspace;

const mockBuildApp = buildApp as MockedFunction<typeof buildApp>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  workspace.reset();
});

test('start passes context to `buildApp`', () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  mockBuildApp.mockReturnValueOnce({ listen } as unknown as Application);

  const baseLogger = mockBaseLogger({ fn: vi.fn });
  workspace = createWorkspace(makeTemporaryDirectory(), baseLogger);
  const auth = buildMockDippedSmartCardAuth(vi.fn);

  start({
    auth,
    baseLogger,
    workspace,
  });

  expect(mockBuildApp).toHaveBeenCalledWith({
    workspace,
    auth,
    logger: expect.anything(),
    usbDrive: expect.anything(),
    printer: expect.anything(),
  });
  expect(listen).toHaveBeenCalledWith(PORT, expect.any(Function));

  expect(baseLogger.log).toHaveBeenCalledWith(
    LogEventId.ApplicationStartup,
    'system',
    {
      message: expect.stringContaining('VxPrint backend running'),
      disposition: 'success',
    }
  );
});

test('DataCheckOnStartup log when no ballot print counts are present', () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  mockBuildApp.mockReturnValueOnce({ listen } as unknown as Application);

  const baseLogger = mockBaseLogger({ fn: vi.fn });
  workspace = createWorkspace(makeTemporaryDirectory(), baseLogger);
  const auth = buildMockDippedSmartCardAuth(vi.fn);

  start({ auth, baseLogger, workspace });

  expect(baseLogger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'No ballot print counts are present in the database on machine startup.',
      ballotPrintCount: 0,
    }
  );
});

test('DataCheckOnStartup log when ballot print counts are present', () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  mockBuildApp.mockReturnValueOnce({ listen } as unknown as Application);

  const baseLogger = mockBaseLogger({ fn: vi.fn });
  workspace = createWorkspace(makeTemporaryDirectory(), baseLogger);
  vi.spyOn(workspace.store, 'getTotalBallotPrintCount').mockReturnValue(5);
  const auth = buildMockDippedSmartCardAuth(vi.fn);

  start({ auth, baseLogger, workspace });

  expect(baseLogger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'Ballot print counts are present in the database on machine startup.',
      ballotPrintCount: 5,
    }
  );
});

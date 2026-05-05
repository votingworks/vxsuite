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
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { PORT } from './globals';
import { buildApp } from './app';

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
});

test('logs ApplicationStartup success when server starts listening', () => {
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
    LogEventId.ApplicationStartup,
    'system',
    {
      message: expect.stringContaining('VxPrint backend running'),
      disposition: 'success',
    }
  );
});

test('logs DataCheckOnStartup when printed ballot data is present', () => {
  const listen = vi.fn((_port: number, callback: () => unknown) => {
    callback();
    return { close: vi.fn() };
  });
  mockBuildApp.mockReturnValueOnce({ listen } as unknown as Application);

  const baseLogger = mockBaseLogger({ fn: vi.fn });
  workspace = createWorkspace(makeTemporaryDirectory(), baseLogger);
  vi.spyOn(workspace.store, 'getTotalBallotsPrinted').mockReturnValue(5);
  const auth = buildMockDippedSmartCardAuth(vi.fn);

  start({ auth, baseLogger, workspace });

  expect(baseLogger.log).toHaveBeenCalledWith(
    LogEventId.DataCheckOnStartup,
    'system',
    {
      message:
        'Printed ballot data is present in the database at machine startup.',
      ballotsPrinted: 5,
    }
  );
});

test('logs DataCheckOnStartup when no printed ballot data is present', () => {
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
        'No printed ballot data is present in the database at machine startup.',
      ballotsPrinted: 0,
    }
  );
});

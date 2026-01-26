import {
  beforeEach,
  expect,
  test,
  vi,
  MockedFunction,
  afterEach,
} from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
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

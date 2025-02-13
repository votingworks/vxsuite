import {
  afterEach,
  beforeEach,
  expect,
  MockedFunction,
  test,
  vi,
} from 'vitest';
import { LogEventId, mockBaseLogger } from '@votingworks/logging';
import { Application } from 'express';
import { dirSync } from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { testDetectDevices } from '@votingworks/backend';
import { buildApp } from './app';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { buildMockLogger } from '../test/helpers/shared_helpers';

vi.mock('./app');

const buildAppMock = buildApp as MockedFunction<typeof buildApp>;

let workspace!: Workspace;

beforeEach(() => {
  workspace = createWorkspace(dirSync().name, mockBaseLogger({ fn: vi.fn }));
});

afterEach(() => {
  workspace.reset();
});

test('start passes the workspace to `buildApp`', async () => {
  const listen = vi.fn<(port: number, callback: () => unknown) => void>();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  expect(buildAppMock).toHaveBeenCalledWith({
    auth: expect.anything(),
    machine: expect.anything(),
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
    logger,
  });
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));

  const callback = listen.mock.calls[0][1];
  await callback();

  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.ApplicationStartup,
    expect.anything(),
    expect.anything()
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.WorkspaceConfigurationMessage,
    expect.anything(),
    expect.anything()
  );
});

test('logs device attach/unattach events', () => {
  const listen = vi.fn();
  const auth = buildMockInsertedSmartCardAuth(vi.fn);
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(vi.fn),
    workspace,
    logger,
  });

  testDetectDevices(logger, expect);
});

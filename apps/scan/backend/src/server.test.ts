import { LogEventId } from '@votingworks/logging';
import { Application } from 'express';
import { dirSync } from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { buildApp } from './app';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import {
  buildMockLogger,
  createPrecinctScannerStateMachineMock,
} from '../test/helpers/custom_helpers';

jest.mock('./app');

const buildAppMock = buildApp as jest.MockedFunction<typeof buildApp>;

let workspace!: Workspace;

beforeEach(() => {
  workspace = createWorkspace(dirSync().name);
});

afterEach(() => {
  workspace.reset();
});

test('start passes the state machine and workspace to `buildApp`', async () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const listen = jest.fn();
  const auth = buildMockInsertedSmartCardAuth();
  const logger = buildMockLogger(auth, workspace);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(),
    workspace,
    logger,
    precinctScannerStateMachine,
  });

  expect(buildAppMock).toHaveBeenCalledWith({
    auth: expect.anything(),
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
    logger,
  });
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));

  const callback = listen.mock.calls[0][1];
  await callback();

  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ApplicationStartup,
    expect.anything(),
    expect.anything()
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.ScanServiceConfigurationMessage,
    expect.anything(),
    expect.anything()
  );
});

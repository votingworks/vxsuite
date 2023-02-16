import { fakeLogger, LogEventId, Logger } from '@votingworks/logging';
import { Application } from 'express';
import { dirSync } from 'tmp';
import { createPrecinctScannerStateMachineMock } from '../test/helpers/app_helpers';
import { buildApp } from './app';
import { PORT } from './globals';
import { createInterpreter } from './interpret';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';

jest.mock('./app');

const buildAppMock = buildApp as jest.MockedFunction<typeof buildApp>;

let workspace!: Workspace;

beforeEach(async () => {
  workspace = await createWorkspace(dirSync().name);
});

afterEach(() => {
  workspace.reset();
});

test('start passes the state machine and workspace to `buildApp`', async () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const precinctScannerInterpreter = createInterpreter();
  const listen = jest.fn();
  const logger = fakeLogger();
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    precinctScannerStateMachine,
    precinctScannerInterpreter,
    workspace,
    logger,
  });

  expect(buildAppMock).toHaveBeenCalledWith(
    expect.anything(), // auth
    precinctScannerStateMachine,
    expect.anything(), // precinctScannerInterpreter
    workspace,
    expect.anything(), // usb
    logger
  );
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

test('start uses its own logger if none is provided', () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const precinctScannerInterpreter = createInterpreter();
  const listen = jest.fn();
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({ precinctScannerStateMachine, precinctScannerInterpreter, workspace });

  expect(buildAppMock).toHaveBeenCalledWith(
    expect.anything(), // auth
    precinctScannerStateMachine,
    expect.anything(), // precinctScannerInterpreter
    workspace,
    expect.anything(), // usb
    expect.any(Logger)
  );
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));
});

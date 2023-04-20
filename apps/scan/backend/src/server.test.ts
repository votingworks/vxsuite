import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { dirSync } from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { buildApp } from './app';
import { PORT } from './globals';
import { createInterpreter } from './interpret';
import { start } from './server';
import { PrecinctScannerStateMachine } from './types';
import { createWorkspace, Workspace } from './util/workspace';

jest.mock('./app');
jest.mock('@votingworks/logging');

const buildAppMock = buildApp as jest.MockedFunction<typeof buildApp>;
const LoggerMock = Logger as jest.MockedClass<typeof Logger>;

let workspace!: Workspace;

beforeEach(async () => {
  workspace = await createWorkspace(dirSync().name);
});

afterEach(() => {
  workspace.reset();
});

function createPrecinctScannerStateMachineMock(): jest.Mocked<PrecinctScannerStateMachine> {
  return {
    status: jest.fn(),
    scan: jest.fn(),
    accept: jest.fn(),
    return: jest.fn(),
    calibrate: jest.fn(),
    supportsUltrasonic: jest.fn(),
  };
}

test('start passes the state machine and workspace to `buildApp`', async () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const precinctScannerInterpreter = createInterpreter();
  const listen = jest.fn();
  const logger = new LoggerMock(LogSource.VxScanBackend);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(),
    logger,
    precinctScannerInterpreter,
    precinctScannerStateMachine,
    workspace,
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

test('start uses its own logger if none is provided', async () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const precinctScannerInterpreter = createInterpreter();
  const listen = jest.fn();
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(),
    precinctScannerStateMachine,
    precinctScannerInterpreter,
    workspace,
  });

  expect(buildAppMock).toHaveBeenCalledWith(
    expect.anything(), // auth
    precinctScannerStateMachine,
    expect.anything(), // precinctScannerInterpreter
    workspace,
    expect.anything(), // usb
    expect.any(Logger)
  );
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));

  const callback = listen.mock.calls[0][1];
  await callback();

  expect(LoggerMock).toHaveBeenCalledWith(LogSource.VxScanBackend);
});

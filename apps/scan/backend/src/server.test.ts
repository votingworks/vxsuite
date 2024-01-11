import { LogEventId, Logger, LogSource } from '@votingworks/logging';
import { Application } from 'express';
import { dirSync } from 'tmp';
import { buildMockInsertedSmartCardAuth } from '@votingworks/auth';
import { buildApp } from './app';
import { PORT } from './globals';
import { start } from './server';
import { createWorkspace, Workspace } from './util/workspace';
import { createPrecinctScannerStateMachineMock } from '../test/helpers/custom_helpers';

jest.mock('./app');
jest.mock('@votingworks/logging');

const buildAppMock = buildApp as jest.MockedFunction<typeof buildApp>;
const LoggerMock = Logger as jest.MockedClass<typeof Logger>;

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
  const logger = new LoggerMock(LogSource.VxScanBackend);
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(),
    logger,
    precinctScannerStateMachine,
    workspace,
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

test('start uses its own logger if none is provided', async () => {
  const precinctScannerStateMachine = createPrecinctScannerStateMachineMock();
  const listen = jest.fn();
  buildAppMock.mockReturnValueOnce({ listen } as unknown as Application);

  start({
    auth: buildMockInsertedSmartCardAuth(),
    precinctScannerStateMachine,
    workspace,
  });

  expect(buildAppMock).toHaveBeenCalledWith({
    auth: expect.anything(),
    machine: precinctScannerStateMachine,
    workspace,
    usbDrive: expect.anything(),
    printer: expect.anything(),
    logger: expect.anything(),
  });
  expect(listen).toHaveBeenNthCalledWith(1, PORT, expect.any(Function));

  const callback = listen.mock.calls[0][1];
  await callback();

  expect(LoggerMock).toHaveBeenCalledWith(LogSource.VxScanBackend);
});

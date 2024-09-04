import { typedAs } from '@votingworks/basics';
import { LogEventType, LogLine, LogSource } from '.';
import { LogEventId } from './log_event_ids';
import {
  mockBaseLogger,
  mockLogger,
  mockLoggerWithRoleAndSource,
} from './test_utils';

test('mockBaseLogger returns a logger with a spy on logger.log', async () => {
  const logger = mockBaseLogger();
  await logger.log(LogEventId.MachineBootInit, 'system');
  expect(logger.log).toHaveBeenCalledWith(LogEventId.MachineBootInit, 'system');
});

test('mockLogger returns a logger that can print debug logs', async () => {
  const logger = mockLogger(LogSource.System);
  const debug = jest.fn();
  await logger.log(LogEventId.MachineBootInit, 'system', undefined, debug);
  expect(debug).toHaveBeenCalledWith(
    typedAs<LogLine>({
      source: LogSource.System,
      eventId: LogEventId.MachineBootInit,
      eventType: LogEventType.SystemAction,
      user: 'system',
      disposition: 'na',
      details: undefined,
    })
  );
});

test('mockLogger', async () => {
  const logger = mockLogger(LogSource.VxAdminService, () =>
    Promise.resolve('election_manager')
  );

  await logger.logAsCurrentRole(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'election_manager'
  );

  await logger.logAsCurrentRole(LogEventId.MachineBootInit, {
    disposition: 'success',
  });
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    {
      disposition: 'success',
    }
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'election_manager',
    {
      disposition: 'success',
    }
  );

  expect(logger.getSource()).toEqual(LogSource.VxAdminService);
});

test('mockLogger with defaults', async () => {
  const logger = mockLogger();
  await logger.logAsCurrentRole(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'unknown'
  );
  expect(logger.getSource()).toEqual(LogSource.System);
});

test('mockLoggerWithRoleAndSource', async () => {
  const logger = mockLoggerWithRoleAndSource(
    LogSource.VxAdminService,
    'election_manager'
  );
  await logger.logAsCurrentRole(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'election_manager'
  );
  expect(logger.getSource()).toEqual(LogSource.VxAdminService);
});

test('mockLoggerWithRoleAndSource defaults to sysadmin', async () => {
  const logger = mockLoggerWithRoleAndSource(LogSource.VxCentralScanFrontend);
  await logger.logAsCurrentRole(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'system_administrator'
  );
  expect(logger.getSource()).toEqual(LogSource.VxCentralScanFrontend);
});

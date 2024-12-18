import { expect, test, vi } from 'vitest';
import { typedAs } from '@votingworks/basics';
import { LogEventType, LogLine, LogSource } from '.';
import { LogEventId } from './log_event_ids';
import { mockBaseLogger, mockLogger } from './test_utils';

test('mockBaseLogger returns a logger with a spy on logger.log', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  await logger.log(LogEventId.MachineBootInit, 'system');
  expect(logger.log).toHaveBeenCalledWith(LogEventId.MachineBootInit, 'system');
});

test('mockLogger returns a logger that can print debug logs', async () => {
  const logger = mockLogger({ source: LogSource.System, fn: vi.fn });
  const debug = vi.fn();
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
  const logger = mockLogger({
    source: LogSource.VxAdminService,
    role: 'election_manager',
    fn: vi.fn,
  });

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
  const logger = mockLogger({ fn: vi.fn });
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

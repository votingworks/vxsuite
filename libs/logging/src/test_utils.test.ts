import { LogSource } from '.';
import { LogEventId } from './log_event_ids';
import { mockBaseLogger, mockLogger } from './test_utils';

test('mockBaseLogger returns a logger with a spy on logger.log', async () => {
  const logger = mockBaseLogger();
  await logger.log(LogEventId.MachineBootInit, 'system');
  expect(logger.log).toHaveBeenCalledWith(LogEventId.MachineBootInit, 'system');
});

test('mockLogger', async () => {
  const logger = mockLogger(LogSource.VxAdminService, () =>
    Promise.resolve('election_manager')
  );

  await logger.logAsCurrentUser(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentUser).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'election_manager'
  );

  await logger.logAsCurrentUser(LogEventId.MachineBootInit, {
    disposition: 'success',
  });
  expect(logger.logAsCurrentUser).toHaveBeenCalledWith(
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
  await logger.logAsCurrentUser(LogEventId.MachineBootInit);
  expect(logger.logAsCurrentUser).toHaveBeenCalledWith(
    LogEventId.MachineBootInit
  );
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.MachineBootInit,
    'unknown'
  );
  expect(logger.getSource()).toEqual(LogSource.System);
});

/* eslint-disable no-console */
import { expect, test, vi } from 'vitest';
import {
  BaseLogger,
  LogDispositionStandardTypes,
  LogEventId,
  LogEventType,
  LogSource,
  Logger,
} from '.';

test('logger can log with passed user role', async () => {
  vi.spyOn(console, 'log').mockReturnValue();
  const getUserRole = vi.fn();

  const logger = new Logger(LogSource.VxMarkBackend, getUserRole);
  getUserRole.mockResolvedValue('election_manager');
  await logger.logAsCurrentRole(LogEventId.FileSaved);
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.VxMarkBackend,
      eventId: LogEventId.FileSaved,
      eventType: LogEventType.UserAction,
      user: 'election_manager',
      disposition: LogDispositionStandardTypes.NotApplicable,
    })
  );

  getUserRole.mockResolvedValue('system_administrator');
  await logger.logAsCurrentRole(LogEventId.FileSaved, {
    disposition: 'success',
    message: 'File saved with message.',
  });
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.VxMarkBackend,
      eventId: LogEventId.FileSaved,
      eventType: LogEventType.UserAction,
      user: 'system_administrator',
      message: 'File saved with message.',
      disposition: 'success',
    })
  );
});

test('Logger.from', async () => {
  vi.spyOn(console, 'log').mockReturnValue();
  const baseLogger = new BaseLogger(LogSource.VxCentralScanService);
  const logSpy = vi.spyOn(baseLogger, 'log');
  const logger = Logger.from(baseLogger, () => Promise.resolve('unknown'));
  await logger.logAsCurrentRole(LogEventId.FileSaved);
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.VxCentralScanService,
      eventId: LogEventId.FileSaved,
      eventType: LogEventType.UserAction,
      user: 'unknown',
      disposition: LogDispositionStandardTypes.NotApplicable,
    })
  );
  expect(logSpy).toHaveBeenCalled();
});

test('can provide fallback user', async () => {
  vi.spyOn(console, 'log').mockReturnValue();
  const baseLogger = new BaseLogger(LogSource.VxCentralScanService);
  const logSpy = vi.spyOn(baseLogger, 'log');
  const logger = Logger.from(baseLogger, () => Promise.resolve('unknown'));
  await logger.logAsCurrentRole(
    LogEventId.FileSaved,
    {},
    undefined,
    'cardless_voter'
  );
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.VxCentralScanService,
      eventId: LogEventId.FileSaved,
      eventType: LogEventType.UserAction,
      user: 'cardless_voter',
      disposition: LogDispositionStandardTypes.NotApplicable,
    })
  );
  expect(logSpy).toHaveBeenCalled();
});

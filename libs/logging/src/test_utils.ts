import { Logger } from './logger';
import { LogSource } from './base_types/log_source';
import { LoggingUserRole } from './types';
import { BaseLogger } from './base_logger';

export function mockBaseLogger(
  logSource: LogSource = LogSource.System
): BaseLogger {
  const logger = new BaseLogger(logSource);
  logger.log = jest.fn().mockResolvedValue(undefined);
  return logger;
}

export function mockLogger(
  source: LogSource = LogSource.System,
  getUserRole: () => Promise<LoggingUserRole> = () => Promise.resolve('unknown')
): Logger {
  const logger = new Logger(source, getUserRole);

  logger.log = jest.fn();
  logger.logAsCurrentUser = jest.fn(async (eventId, logData) =>
    logData
      ? logger.log(eventId, await getUserRole(), logData)
      : logger.log(eventId, await getUserRole())
  );
  return logger;
}

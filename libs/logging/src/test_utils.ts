import { Logger } from './logger';
import { LogSource } from './base_types/log_source';
import { LogDispositionStandardTypes, LogLine, LoggingUserRole } from './types';
import { BaseLogger } from './base_logger';
import { getDetailsForEventId } from './log_event_ids';

export function mockBaseLogger({
  logSource = LogSource.System,
}: {
  logSource?: LogSource;
} = {}): BaseLogger {
  const logger = new BaseLogger(logSource);
  logger.log = jest.fn().mockResolvedValue(undefined);
  return logger;
}

/**
 * Create a mock logger for testing with a source of `LogSource.System` and role
 * of `unknown`.
 */
export function mockLogger(): Logger;

/**
 * Create a mock logger for testing with a specific source and a role of
 * `unknown`.
 */
export function mockLogger(options: { source: LogSource }): Logger;

/**
 * Create a mock logger for testing with a specific role and a source of
 * `LogSource.System` if not provided.
 */
export function mockLogger(options: {
  source?: LogSource;
  role: LoggingUserRole;
}): Logger;

/**
 * Create a mock logger for testing with a function to get the current role each
 * time a log is made and a source of `LogSource.System` if not provided.
 */
export function mockLogger(options: {
  source?: LogSource;
  getCurrentRole: () => Promise<LoggingUserRole>;
}): Logger;

/**
 * Create a mock logger for testing.
 */
export function mockLogger({
  source = LogSource.System,
  role = 'unknown',
  getCurrentRole = () => Promise.resolve(role),
}: {
  source?: LogSource;
  role?: LoggingUserRole;
  getCurrentRole?: () => Promise<LoggingUserRole>;
} = {}): Logger {
  const logger = new Logger(source, getCurrentRole);

  // eslint-disable-next-line @typescript-eslint/require-await
  logger.log = jest.fn(async (eventId, user, logData, outerDebug) => {
    if (outerDebug) {
      const eventSpecificDetails = getDetailsForEventId(eventId);
      /* istanbul ignore next */
      const {
        message = eventSpecificDetails.defaultMessage,
        disposition = LogDispositionStandardTypes.NotApplicable,
        ...additionalData
      } = logData ?? {};
      const logLine: LogLine = {
        source,
        eventId,
        eventType: eventSpecificDetails.eventType,
        user,
        message,
        disposition,
        ...additionalData,
      };
      outerDebug(logLine);
    }
  });
  logger.logAsCurrentRole = jest.fn(async (eventId, logData) =>
    logData
      ? logger.log(eventId, await getCurrentRole(), logData)
      : logger.log(eventId, await getCurrentRole())
  );
  return logger;
}

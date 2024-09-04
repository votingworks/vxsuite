import { Logger } from './logger';
import { LogSource } from './base_types/log_source';
import { LogDispositionStandardTypes, LogLine, LoggingUserRole } from './types';
import { BaseLogger } from './base_logger';
import { getDetailsForEventId } from './log_event_ids';

export function mockBaseLogger(
  logSource: LogSource = LogSource.System
): BaseLogger {
  const logger = new BaseLogger(logSource);
  logger.log = jest.fn().mockResolvedValue(undefined);
  return logger;
}

export function mockLogger(
  source: LogSource = LogSource.System,
  getCurrentRole: () => Promise<LoggingUserRole> = () =>
    Promise.resolve('unknown')
): Logger {
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

export function mockLoggerWithRoleAndSource(
  source: LogSource,
  role: LoggingUserRole = 'system_administrator'
): Logger {
  return mockLogger(source, () => Promise.resolve(role));
}

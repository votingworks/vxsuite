import type { Mocked, vi } from 'vitest';
import { Logger } from './logger';
import { LogSource } from './base_types/log_source';
import { LogDispositionStandardTypes, LogLine, LoggingUserRole } from './types';
import { BaseLogger } from './base_logger';
import { getDetailsForEventId } from './log_event_ids';

export interface MockBaseLogger extends BaseLogger {
  log: Mocked<BaseLogger['log']>;
}

export function mockBaseLogger({
  logSource = LogSource.System,
  fn,
}: {
  logSource?: LogSource;
  fn: typeof vi.fn;
}): MockBaseLogger {
  const logger = new BaseLogger(logSource);
  logger.log = fn().mockResolvedValue(undefined);
  return logger;
}

export interface MockLogger extends Logger {
  log: Mocked<Logger['log']>;
  logAsCurrentRole: Mocked<Logger['logAsCurrentRole']>;
}

/**
 * Create a mock logger for testing.
 */
export function mockLogger({
  source = LogSource.System,
  role = 'unknown',
  getCurrentRole = () => Promise.resolve(role),
  fn,
}: {
  source?: LogSource;
  role?: LoggingUserRole;
  getCurrentRole?: () => Promise<LoggingUserRole>;
  fn: typeof vi.fn;
}): MockLogger {
  const logger = new Logger(source, getCurrentRole);

  logger.log = fn(
    // eslint-disable-next-line @typescript-eslint/require-await
    async (eventId, user, logData, outerDebug) => {
      if (outerDebug) {
        const eventSpecificDetails = getDetailsForEventId(eventId);
        /* istanbul ignore next - @preserve */
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
    }
  );
  logger.logAsCurrentRole = fn(async (eventId, logData) =>
    logData
      ? logger.log(eventId, await getCurrentRole(), logData)
      : logger.log(eventId, await getCurrentRole())
  );
  return logger;
}

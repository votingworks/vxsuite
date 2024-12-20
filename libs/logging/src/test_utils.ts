import type { Mocked, vi } from 'vitest';
import { Logger } from './logger';
import { LogSource } from './base_types/log_source';
import { LogDispositionStandardTypes, LogLine, LoggingUserRole } from './types';
import { BaseLogger } from './base_logger';
import { getDetailsForEventId } from './log_event_ids';

export interface MockBaseLogger<T> extends BaseLogger {
  log: T extends typeof jest.fn
    ? jest.MockedFunction<BaseLogger['log']>
    : T extends typeof vi.fn
    ? Mocked<BaseLogger['log']>
    : never;
}

export function mockBaseLogger(options: {
  logSource?: LogSource;
  fn: typeof jest.fn;
}): MockBaseLogger<typeof jest.fn>;
export function mockBaseLogger(options: {
  logSource?: LogSource;
  fn: typeof vi.fn;
}): MockBaseLogger<typeof vi.fn>;
export function mockBaseLogger({
  logSource = LogSource.System,
  fn,
}: {
  logSource?: LogSource;
  fn?: typeof jest.fn | typeof vi.fn;
}): MockBaseLogger<typeof jest.fn> | MockBaseLogger<typeof vi.fn> {
  const logger = new BaseLogger(logSource);
  logger.log = (fn as typeof jest.fn)().mockResolvedValue(undefined);
  return logger;
}

export interface MockLogger<T = typeof jest.fn> extends Logger {
  log: T extends typeof jest.fn
    ? jest.MockedFunction<Logger['log']>
    : T extends typeof vi.fn
    ? Mocked<Logger['log']>
    : never;
  logAsCurrentRole: T extends typeof jest.fn
    ? jest.MockedFunction<Logger['logAsCurrentRole']>
    : T extends typeof vi.fn
    ? Mocked<Logger['logAsCurrentRole']>
    : never;
}

/**
 * Create a mock logger for testing with a role and a source (default
 * `LogSource.System`).
 */
export function mockLogger<
  T extends typeof jest.fn | typeof vi.fn = typeof jest.fn,
>(options: {
  source?: LogSource;
  role?: LoggingUserRole;
  fn: T;
}): MockLogger<T>;

/**
 * Create a mock logger for testing with a function to get the current role each
 * time a log is made and a source of `LogSource.System` if not provided.
 */
export function mockLogger<T extends typeof jest.fn | typeof vi.fn>(options: {
  source?: LogSource;
  getCurrentRole?: () => Promise<LoggingUserRole>;
  fn: T;
}): MockLogger<T>;

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
  fn: typeof jest.fn | typeof vi.fn;
}): MockLogger<typeof jest.fn> | MockLogger<typeof vi.fn> {
  const logger = new Logger(source, getCurrentRole);

  logger.log = (fn as typeof jest.fn)(
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
  logger.logAsCurrentRole = (fn as typeof jest.fn)(async (eventId, logData) =>
    logData
      ? logger.log(eventId, await getCurrentRole(), logData)
      : logger.log(eventId, await getCurrentRole())
  );
  return logger;
}

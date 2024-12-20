import { LogEventId } from './log_event_ids';
import { LogSource } from './base_types/log_source';
import { LogLine, LoggingUserRole } from './types';
import { LogData, BaseLogger } from './base_logger';

export class Logger extends BaseLogger {
  constructor(
    source: LogSource,
    private readonly getCurrentRole: () => Promise<LoggingUserRole>
  ) {
    super(source);
  }

  async logAsCurrentRole(
    eventId: LogEventId,
    logData?: LogData,
    outerDebug?: (logLine: LogLine) => void,
    // When defined if the user is 'unknown' we will instead log the value provided here.
    // This should be used sparingly. It is used for example with the precinct scanner as the
    // "voter" user does not authenticate with the system and can be assumed.
    fallbackUser?: LoggingUserRole
  ): Promise<void> {
    const currentUser = await this.getCurrentRole();
    if (currentUser === 'unknown' && fallbackUser) {
      return this.log(eventId, fallbackUser, logData, outerDebug);
    }
    return this.log(eventId, await this.getCurrentRole(), logData, outerDebug);
  }

  /**
   * Create logger from an existing logger. This allows two things:
   *  - No need to re-specify the `LogSource`
   *  - `log` method carries over from one logger to the next, so that mocked loggers will remain mocked
   */
  static from(
    baseLogger: BaseLogger,
    getCurrentRole: () => Promise<LoggingUserRole>
  ): Logger {
    const logger = new Logger(baseLogger.getSource(), getCurrentRole);
    logger.log = baseLogger.log;
    return logger;
  }
}

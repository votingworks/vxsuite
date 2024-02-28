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
    outerDebug?: (logLine: LogLine) => void
  ): Promise<void> {
    return this.log(eventId, await this.getCurrentRole(), logData, outerDebug);
  }

  static from(
    baseLogger: BaseLogger,
    getCurrentRole: () => Promise<LoggingUserRole>
  ): Logger {
    const logger = new Logger(baseLogger.getSource(), getCurrentRole);
    logger.log = baseLogger.log;
    return logger;
  }
}

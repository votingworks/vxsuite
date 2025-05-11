import { Dictionary } from '@votingworks/types';
import { LogEventId, LogSource, getDetailsForEventId } from './log_event_enums';
import {
  LogDisposition,
  LogDispositionStandardTypes,
  LogLine,
  LoggingUserRole,
} from './types';

export const LOGS_ROOT_LOCATION = '/var/log';
export const LOG_NAME = 'vx-logs';
export const FULL_LOG_PATH = `${LOGS_ROOT_LOCATION}/${LOG_NAME}.log`;

export interface LogData extends Dictionary<string | boolean | number> {
  message?: string;
  disposition?: LogDisposition;
}

export class BaseLogger {
  constructor(private readonly source: LogSource) {}

  getSource(): LogSource {
    return this.source;
  }

  log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData?: LogData,
    outerDebug?: (logLine: LogLine) => void
  ): void {
    const eventSpecificDetails = getDetailsForEventId(eventId);
    const {
      message = eventSpecificDetails.defaultMessage,
      disposition = LogDispositionStandardTypes.NotApplicable,
      ...additionalData
    } = logData ?? {};
    const logLine: LogLine = {
      source: this.source,
      eventId,
      eventType: eventSpecificDetails.eventType,
      user,
      message,
      disposition,
      ...additionalData,
    };
    // If the caller is passing in a debug instance, and we are not in production log to the debugger rather than through the normal logging pipeline.
    // This is to make logs more manageable in development, so a developer can toggle what logs to view with the normal debug namespaces.
    /* istanbul ignore next - figure out how to test this @preserve */
    if (outerDebug && process.env.NODE_ENV !== 'production') {
      outerDebug(logLine);
    }
  }
}

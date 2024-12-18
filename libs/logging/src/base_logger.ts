import { Dictionary } from '@votingworks/types';
import makeDebug from 'debug';
import { LogEventId, getDetailsForEventId } from './log_event_ids';
import { CLIENT_SIDE_LOG_SOURCES, LogSource } from './base_types/log_source';
import {
  LogDisposition,
  LogDispositionStandardTypes,
  LogLine,
  LoggingUserRole,
} from './types';

export const LOGS_ROOT_LOCATION = '/var/log';
export const LOG_NAME = 'vx-logs';
export const FULL_LOG_PATH = `${LOGS_ROOT_LOCATION}/${LOG_NAME}.log`;

const debug = makeDebug('logger');

export interface LogData extends Dictionary<string | boolean | number> {
  message?: string;
  disposition?: LogDisposition;
}

export class BaseLogger {
  constructor(
    private readonly source: LogSource,
    private readonly kiosk?: KioskBrowser.Kiosk
  ) {}

  getSource(): LogSource {
    return this.source;
  }

  async log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData?: LogData,
    outerDebug?: (logLine: LogLine) => void
  ): Promise<void> {
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
      return;
    }

    if (CLIENT_SIDE_LOG_SOURCES.includes(this.source)) {
      debug(logLine); // for internal debugging use log to the console
      if (this.kiosk) {
        await this.kiosk.log(
          JSON.stringify({
            timeLogInitiated: Date.now().toString(),
            ...logLine,
          })
        );
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(logLine));
    }
  }
}

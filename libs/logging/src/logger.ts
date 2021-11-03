import makeDebug from 'debug';
import { Dictionary } from '@votingworks/types';
import {
  CLIENT_SIDE_LOG_SOURCES,
  LogLine,
  LogDisposition,
  LogDispositionStandardTypes,
  LoggingUserRole,
  LogSource,
} from './types';
import { LogEventId, getDetailsForEventId } from './logEventIDs';

const debug = makeDebug('logger');

interface LogData extends Dictionary<string> {
  message?: string;
  disposition?: LogDisposition;
}

export class Logger {
  constructor(
    private readonly source: LogSource,
    private readonly kiosk?: KioskBrowser.Kiosk
  ) {}

  async log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData: LogData = {}
  ): Promise<void> {
    const eventSpecificDetails = getDetailsForEventId(eventId);
    const {
      message = eventSpecificDetails.defaultMessage,
      disposition = LogDispositionStandardTypes.NotApplicable,
      ...additionalData
    } = logData;
    const logLine: LogLine = {
      source: this.source,
      eventId,
      eventType: eventSpecificDetails.eventType,
      user,
      message,
      disposition,
      ...additionalData,
    };
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
      console.log(logLine);
    }
  }
}

import makeDebug from 'debug';
import { Dictionary } from '@votingworks/types';
import { getDetailsForEventId, LogLine } from '.';
import { LogEventId } from './logEventIDs';
import {
  LogDisposition,
  LogDispositionStandardTypes,
  LoggingUserRole,
  LogSource,
} from './types';

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
    if (this.kiosk) {
      debug(logLine); // for internal debugging use log to the console
      await this.kiosk.log(
        JSON.stringify({
          timeLogInitiated: Date.now().toString(),
          ...logLine,
        })
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(logLine);
    }
  }
}

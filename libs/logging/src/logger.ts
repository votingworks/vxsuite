import makeDebug from 'debug';
import {
  Dictionary,
  ElectionDefinition,
  safeParse,
  safeParseJson,
} from '@votingworks/types';
import { z } from 'zod';
import { assert } from '@votingworks/utils';
import {
  Device,
  ElectionEventLog,
  ElectionEventLogDocumentation,
  Event,
  EventDispositionType,
  EventIdDescription,
  EventTypeDescription,
} from '@votingworks/cdf-types-election-event-logging';
import {
  LogLine,
  LogDisposition,
  LogDispositionStandardTypes,
  LoggingUserRole,
  DEVICE_TYPES_FOR_APP,
  LogLineSchema,
} from './types';
import { CLIENT_SIDE_LOG_SOURCES, LogSource } from './log_source';
import { LogEventId, getDetailsForEventId } from './log_event_ids';
import { getDocumentationForEventType, LogEventType } from './log_event_types';

export const LOGS_ROOT_LOCATION = '/var/log';
export const LOG_NAME = 'vx-logs';

const debug = makeDebug('logger');

interface LogData extends Dictionary<string | boolean | number> {
  message?: string;
  disposition?: LogDisposition;
}

export function extractAdditionalKeysFromObj(
  innerObj: Dictionary<string>,
  outerObj: Dictionary<string>
): Dictionary<string> {
  const baseDict: Dictionary<string> = {};
  return Object.keys(outerObj)
    .filter((key) => !(key in innerObj))
    .reduce((res, nextKey) => {
      res[nextKey] = outerObj[nextKey];
      return res;
    }, baseDict);
}

export class Logger {
  constructor(
    private readonly source: LogSource,
    private readonly kiosk?: KioskBrowser.Kiosk
  ) {}

  async log(
    eventId: LogEventId,
    user: LoggingUserRole,
    logData: LogData = {},
    outerDebug?: debug.Debugger
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
    // If the caller is passing in a debug instance, and we are not in production log to the debugger rather then through the normal logging pipeline.
    // This is to make logs more manageable in development, so a developer can toggle what logs to view with the normal debug namespaces.
    /* istanbul ignore next - figure out how to test this */
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
      console.log(logLine);
    }
  }

  buildCDFLog(
    electionDefinition: ElectionDefinition,
    rawLogFileContents: string,
    machineId: string,
    codeVersion: string,
    currentUser: LoggingUserRole
  ): string {
    if (!CLIENT_SIDE_LOG_SOURCES.includes(this.source)) {
      void this.log(LogEventId.LogConversionToCdfComplete, currentUser, {
        message: 'The current application is not able to export logs.',
        result: 'Log file not converted to CDF format.',
        disposition: 'failure',
      });
      throw new Error('Can only export CDF logs from a frontend app.');
    }

    const allEvents: Event[] = [];
    const logs = rawLogFileContents.split('\n').filter((l) => l !== '');
    for (const [idx, log] of logs.entries()) {
      const decodedLogResult = safeParseJson(log, LogLineSchema);
      if (decodedLogResult.isErr()) {
        void this.log(LogEventId.LogConversionToCdfLogLineError, currentUser, {
          message: `Malformed log line identified, log line will be ignored: ${log} `,
          result: 'Log line will not be included in CDF output',
          disposition: 'failure',
        });
        continue;
      }
      const decodedLog = decodedLogResult.ok();
      assert(typeof decodedLog.timeLogWritten === 'string'); // While this is not enforced in the LogLine type the zod schema will enforce it is always present so we know this to be true.

      const rawDecodedObject = JSON.parse(log);
      const customInformation = extractAdditionalKeysFromObj(
        decodedLog,
        rawDecodedObject
      );

      const standardDispositionResult = safeParse(
        z.nativeEnum(EventDispositionType),
        decodedLog.disposition
      );
      const disposition = standardDispositionResult.isOk()
        ? standardDispositionResult.ok()
        : decodedLog.disposition === ''
        ? EventDispositionType.Na
        : EventDispositionType.Other;
      const cdfEvent: Event = {
        Id: decodedLog.eventId,
        Disposition: disposition,
        Sequence: idx.toString(),
        TimeStamp: decodedLog.timeLogWritten,
        Type: decodedLog.eventType,
        Description: decodedLog.message,
        Details: JSON.stringify({
          ...customInformation,
          source: decodedLog.source,
        }),
        UserId: decodedLog.user,
      };
      if (disposition === 'other') {
        cdfEvent.OtherDisposition = decodedLog.disposition;
      }
      allEvents.push(cdfEvent);
    }

    const currentDevice: Device = {
      Type: DEVICE_TYPES_FOR_APP[this.source],
      Id: machineId,
      Version: codeVersion,
      Event: allEvents,
    };
    const eventElectionLog: ElectionEventLog = {
      Device: [currentDevice],
      ElectionId: electionDefinition.electionHash,
      GeneratedTime: new Date().toISOString(),
    };

    void this.log(LogEventId.LogConversionToCdfComplete, currentUser, {
      message: 'Log file successfully converted to CDF format.',
      disposition: 'success',
    });
    return JSON.stringify(eventElectionLog);
  }

  buildCDFLogDocumentationFileContent(
    // Once we have a common type for MachineConfig with model/manufacturer it will likely make more sense to just pass that in.
    machineId: string,
    machineManufacturer: string,
    machineModel: string,
    codeVersion: string
  ): string {
    const allEventTypes: EventTypeDescription[] = Object.values(
      LogEventType
    ).map((eventType) => {
      const eventTypeInformation = getDocumentationForEventType(eventType);
      return {
        Description: eventTypeInformation.documentationMessage,
        Type: eventType,
      };
    });
    const allEventIdsForDevice: EventIdDescription[] = Object.values(LogEventId)
      .map((eventId) => getDetailsForEventId(eventId))
      .filter(
        (eventIdDetails) =>
          eventIdDetails.restrictInDocumentationToApps === undefined ||
          eventIdDetails.restrictInDocumentationToApps.includes(this.source)
      )
      .map((eventIdDetails) => {
        return {
          Id: eventIdDetails.eventId,
          Description: eventIdDetails.documentationMessage,
        };
      });
    const documentationLog: ElectionEventLogDocumentation = {
      DeviceId: machineId,
      DeviceManufacturer: machineManufacturer,
      DeviceModel: machineModel,
      DeviceVersion: codeVersion,
      EventIdDescription: allEventIdsForDevice,
      EventTypeDescription: allEventTypes,
      GeneratedDate: new Date().toISOString(),
    };
    return JSON.stringify(documentationLog);
  }
}

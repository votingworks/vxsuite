import { assert, lines, typedAs } from '@votingworks/basics';
import {
  Dictionary,
  EventLogging,
  safeParse,
  safeParseZ4,
  safeParseJson,
  safeParseJsonZ4,
} from '@votingworks/types';
import { JsonStreamInput, RawJson, jsonStream } from '@votingworks/utils';
import { z } from 'zod';
import { z as z4 } from 'zod4';
import { EventDispositionType } from '@votingworks/types/src/cdf/election-event-logging';
import { LogEventId } from './log_event_ids';
// import { CLIENT_SIDE_LOG_SOURCES } from './base_types/log_source';
import {
  DEVICE_TYPES_FOR_APP,
  LoggingUserRole,
  LoggingUserRoleSchema,
  LogLine,
  LogLineKnownFields,
  LogLineSchema,
  LogLineSchemaZ4,
} from './types';
import { Logger } from './logger';
import { LogEventType, LogSource } from './base_types';

export async function* filterErrorLogs(
  inputStream: AsyncIterable<string>
): AsyncIterable<string> {
  const inputLines = lines(inputStream).filter((l) => l !== '');
  for await (const line of inputLines) {
    try {
      const obj = JSON.parse(line);
      if (obj['disposition'] && obj.disposition === 'failure') {
        yield line;
      }
    } catch {
      // Skip this line if there are any errors parsing the JSON
    }
  }
}

function extractAdditionalKeysFromObj(
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

function extractAdditionalKeysFromObj2(
  omit: readonly string[],
  outerObj: Dictionary<string>
): Dictionary<string> {
  const baseDict: Dictionary<string> = {};
  return Object.keys(outerObj)
    .filter((key) => !omit.includes(key))
    .reduce((res, nextKey) => {
      res[nextKey] = outerObj[nextKey];
      return res;
    }, baseDict);
}

async function* generateCdfEventsForExport(
  logger: Logger,
  logFileReader: AsyncIterable<string>
): AsyncGenerator<EventLogging.Event> {
  const logs = lines(logFileReader).filter((l) => l !== '');
  for await (const [idx, log] of logs.enumerate()) {
    const decodedLogResult = safeParseJson(log, LogLineSchema);
    if (decodedLogResult.isErr()) {
      await logger.logAsCurrentRole(LogEventId.LogConversionToCdfLogLineError, {
        message: `Malformed log line identified, log line will be ignored: ${log} `,
        result: 'Log line will not be included in CDF output',
        disposition: 'failure',
      });
      continue;
    }
    const decodedLog = decodedLogResult.ok();
    assert(typeof decodedLog['timeLogWritten'] === 'string'); // While this is not enforced in the LogLine type the zod schema will enforce it is always present so we know this to be true.

    const rawDecodedObject = JSON.parse(log);
    const customInformation = extractAdditionalKeysFromObj(
      decodedLog,
      rawDecodedObject
    );

    const standardDispositionResult = safeParse(
      z.nativeEnum(EventLogging.EventDispositionType),
      decodedLog.disposition
    );
    const disposition = standardDispositionResult.isOk()
      ? standardDispositionResult.ok()
      : decodedLog.disposition === ''
      ? EventLogging.EventDispositionType.Na
      : EventLogging.EventDispositionType.Other;
    const cdfEvent: EventLogging.Event = {
      '@type': 'EventLogging.Event',
      Id: decodedLog.eventId,
      Disposition: disposition,
      OtherDisposition:
        disposition === 'other' ? decodedLog.disposition : undefined,
      Sequence: idx.toString(),
      TimeStamp: decodedLog['timeLogWritten'],
      Type: decodedLog.eventType,
      Description: decodedLog.message,
      Details: JSON.stringify({
        ...customInformation,
        source: decodedLog.source,
      }),
      UserId: decodedLog.user,
    };
    yield cdfEvent;
  }
}

async function* generateCdfEventsPreStringified(
  logger: Logger,
  logFileReader: AsyncIterable<string>
): AsyncGenerator<RawJson> {
  const logs = lines(logFileReader).filter((l) => l !== '');
  for await (const [idx, log] of logs.enumerate()) {
    const decodedLogResult = safeParseJson(log, LogLineSchema);
    if (decodedLogResult.isErr()) {
      void logger.logAsCurrentRole(LogEventId.LogConversionToCdfLogLineError, {
        message: `Malformed log line identified, log line will be ignored: ${log} `,
        result: 'Log line will not be included in CDF output',
        disposition: 'failure',
      });
      continue;
    }
    const decodedLog = decodedLogResult.ok();
    assert(typeof decodedLog['timeLogWritten'] === 'string'); // While this is not enforced in the LogLine type the zod schema will enforce it is always present so we know this to be true.

    const rawDecodedObject = JSON.parse(log);
    const customInformation = extractAdditionalKeysFromObj(
      decodedLog,
      rawDecodedObject
    );

    const standardDispositionResult = safeParse(
      z.nativeEnum(EventLogging.EventDispositionType),
      decodedLog.disposition
    );
    const disposition = standardDispositionResult.isOk()
      ? standardDispositionResult.ok()
      : decodedLog.disposition === ''
      ? EventLogging.EventDispositionType.Na
      : EventLogging.EventDispositionType.Other;
    const cdfEvent: EventLogging.Event = {
      '@type': 'EventLogging.Event',
      Id: decodedLog.eventId,
      Disposition: disposition,
      OtherDisposition:
        disposition === 'other' ? decodedLog.disposition : undefined,
      Sequence: idx.toString(),
      TimeStamp: decodedLog['timeLogWritten'],
      Type: decodedLog.eventType,
      Description: decodedLog.message,
      Details: JSON.stringify({
        ...customInformation,
        source: decodedLog.source,
      }),
      UserId: decodedLog.user,
    };
    yield new RawJson(JSON.stringify(cdfEvent));
  }
}

async function* generateCdfEventsPreStringifiedZ4(
  logger: Logger,
  logFileReader: AsyncIterable<string>
): AsyncGenerator<RawJson> {
  const logs = lines(logFileReader).filter((l) => l !== '');
  for await (const [idx, log] of logs.enumerate()) {
    const decodedLogResult = safeParseJsonZ4(log, LogLineSchemaZ4);
    if (decodedLogResult.isErr()) {
      void logger.logAsCurrentRole(LogEventId.LogConversionToCdfLogLineError, {
        message: `Malformed log line identified, log line will be ignored: ${log} `,
        result: 'Log line will not be included in CDF output',
        disposition: 'failure',
      });
      continue;
    }
    const decodedLog = decodedLogResult.ok();
    assert(typeof decodedLog['timeLogWritten'] === 'string'); // While this is not enforced in the LogLine type the zod schema will enforce it is always present so we know this to be true.

    const rawDecodedObject = JSON.parse(log);
    const customInformation = extractAdditionalKeysFromObj(
      decodedLog,
      rawDecodedObject
    );

    const standardDispositionResult = safeParseZ4(
      z4.nativeEnum(EventLogging.EventDispositionType),
      decodedLog.disposition
    );
    const disposition = standardDispositionResult.isOk()
      ? standardDispositionResult.ok()
      : decodedLog.disposition === ''
      ? EventLogging.EventDispositionType.Na
      : EventLogging.EventDispositionType.Other;
    const cdfEvent: EventLogging.Event = {
      '@type': 'EventLogging.Event',
      Id: decodedLog.eventId,
      Disposition: disposition,
      OtherDisposition:
        disposition === 'other' ? decodedLog.disposition : undefined,
      Sequence: idx.toString(),
      TimeStamp: decodedLog['timeLogWritten'],
      Type: decodedLog.eventType,
      Description: decodedLog.message,
      Details: JSON.stringify({
        ...customInformation,
        source: decodedLog.source,
      }),
      UserId: decodedLog.user,
    };
    yield new RawJson(JSON.stringify(cdfEvent));
  }
}

const LOG_SOURCES = Object.values(LogSource) as string[];
const LOG_EVENT_IDS = Object.values(LogEventId) as string[];
const LOG_EVENT_TYPES = Object.values(LogEventType) as string[];
const LOG_DISPOSITION_TYPES = Object.values(EventDispositionType) as string[];
const LOG_USER_ROLES: readonly string[] = Object.keys(
  typedAs<Record<LoggingUserRole, void>>({
    vendor: undefined,
    system_administrator: undefined,
    election_manager: undefined,
    poll_worker: undefined,
    cardless_voter: undefined,
    'vx-staff': undefined,
    system: undefined,
    unknown: undefined,
  })
);

interface LogLineExtraCdfFields {
  timeLogWritten: string;
}

interface LogLineKnownFieldsExtended
  extends LogLineKnownFields,
    LogLineExtraCdfFields {}

export const LOG_LINES_FIELDS: readonly string[] = Object.keys(
  typedAs<Record<keyof LogLineKnownFieldsExtended, void>>({
    source: undefined,
    eventId: undefined,
    eventType: undefined,
    user: undefined,
    disposition: undefined,
    message: undefined,
    timeLogInitiated: undefined,
    timeLogWritten: undefined,
  })
);

interface LogLineExtended extends LogLine {
  timeLogWritten: string;
}

function parseLogLine(line: string): LogLineExtended | Error {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    if (err instanceof Error) return err;
    return new Error(`${err}`);
  }

  if (!LOG_SOURCES.includes(parsed['source'] as string)) {
    return new Error('Invalid log source');
  }

  if (!LOG_EVENT_IDS.includes(parsed['eventId'] as string)) {
    return new Error('Invalid event ID');
  }

  if (!LOG_EVENT_TYPES.includes(parsed['eventType'] as string)) {
    return new Error('Invalid event Type');
  }

  if (!LOG_USER_ROLES.includes(parsed['user'] as string)) {
    return new Error('Invalid roleType');
  }

  if (typeof parsed['disposition'] !== 'string') {
    return new Error('Missing or invalid field: disposition');
  }

  if (typeof parsed['timeLogWritten'] !== 'string') {
    return new Error('Missing or invalid field: timeLogWritten');
  }

  return parsed as LogLineExtended;
}

const KNOWN_FIELDS = [
  'source',
  'eventId',
  'eventType',
  'user',
  'disposition',
  'message',
  'timeLogInitiated',
  'timeLogWritten',
] as const;

export function convertToCdfEventsNoZod(
  logger: Logger,
  log: string,
  idx: number
): EventLogging.Event | null {
  const decodedLog = parseLogLine(log);
  if (decodedLog instanceof Error) {
    void logger.logAsCurrentRole(LogEventId.LogConversionToCdfLogLineError, {
      message: `Malformed log line identified, log line will be ignored: ${log} `,
      result: 'Log line will not be included in CDF output',
      disposition: 'failure',
    });
    return null;
  }

  const rawDecodedObject = JSON.parse(log);
  const customInformation = extractAdditionalKeysFromObj2(
    KNOWN_FIELDS,
    rawDecodedObject
  );
  customInformation['source'] = decodedLog.source;

  const disposition = LOG_DISPOSITION_TYPES.includes(decodedLog.disposition)
    ? (decodedLog.disposition as EventDispositionType)
    : decodedLog.disposition === ''
    ? EventLogging.EventDispositionType.Na
    : EventLogging.EventDispositionType.Other;

  const cdfEvent: EventLogging.Event = {
    '@type': 'EventLogging.Event',
    Id: decodedLog.eventId,
    Disposition: disposition,
    OtherDisposition:
      disposition === 'other' ? decodedLog.disposition : undefined,
    Sequence: idx.toString(),
    TimeStamp: decodedLog.timeLogWritten,
    Type: decodedLog.eventType,
    Description: decodedLog.message,
    Details: JSON.stringify(customInformation),
    UserId: decodedLog.user,
  };
  return cdfEvent;
}

export type LogExportFormat = 'vxf' | 'cdf' | 'err';

export async function* buildCdfLog(
  logger: Logger,
  logFileReader: AsyncIterable<string>,
  machineId: string,
  codeVersion: string
): AsyncIterable<string> {
  const source = logger.getSource();

  const currentDevice: JsonStreamInput<EventLogging.Device> = {
    '@type': 'EventLogging.Device',
    Type: DEVICE_TYPES_FOR_APP[source],
    Id: machineId,
    Version: codeVersion,
    Event: generateCdfEventsForExport(logger, logFileReader),
  };
  const eventElectionLog: JsonStreamInput<EventLogging.ElectionEventLog> = {
    '@type': 'EventLogging.ElectionEventLog',
    Device: [currentDevice],
    GeneratedTime: new Date().toISOString(),
  };

  await logger.logAsCurrentRole(LogEventId.LogConversionToCdfComplete, {
    message: 'Log file successfully converted to CDF format.',
    disposition: 'success',
  });

  return yield* jsonStream(eventElectionLog);
}

export async function* buildCdfLogPreStringifyEvents(
  logger: Logger,
  logFileReader: AsyncIterable<string>,
  machineId: string,
  codeVersion: string
): AsyncIterable<string> {
  const source = logger.getSource();

  const currentDevice: JsonStreamInput<EventLogging.Device> = {
    '@type': 'EventLogging.Device',
    Type: DEVICE_TYPES_FOR_APP[source],
    Id: machineId,
    Version: codeVersion,
    Event: generateCdfEventsPreStringified(logger, logFileReader),
  };
  const eventElectionLog: JsonStreamInput<EventLogging.ElectionEventLog> = {
    '@type': 'EventLogging.ElectionEventLog',
    Device: [currentDevice],
    GeneratedTime: new Date().toISOString(),
  };

  void logger.logAsCurrentRole(LogEventId.LogConversionToCdfComplete, {
    message: 'Log file successfully converted to CDF format.',
    disposition: 'success',
  });

  return yield* jsonStream(eventElectionLog);
}

export async function* buildCdfLogPreStringifyEventsZ4(
  logger: Logger,
  logFileReader: AsyncIterable<string>,
  machineId: string,
  codeVersion: string
): AsyncIterable<string> {
  const source = logger.getSource();

  const currentDevice: JsonStreamInput<EventLogging.Device> = {
    '@type': 'EventLogging.Device',
    Type: DEVICE_TYPES_FOR_APP[source],
    Id: machineId,
    Version: codeVersion,
    Event: generateCdfEventsPreStringifiedZ4(logger, logFileReader),
  };
  const eventElectionLog: JsonStreamInput<EventLogging.ElectionEventLog> = {
    '@type': 'EventLogging.ElectionEventLog',
    Device: [currentDevice],
    GeneratedTime: new Date().toISOString(),
  };

  void logger.logAsCurrentRole(LogEventId.LogConversionToCdfComplete, {
    message: 'Log file successfully converted to CDF format.',
    disposition: 'success',
  });

  return yield* jsonStream(eventElectionLog);
}

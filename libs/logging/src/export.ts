import { assert, lines } from '@votingworks/basics';
import {
  Dictionary,
  EventLogging,
  safeParse,
  safeParseJson,
} from '@votingworks/types';
import { JsonStreamInput, jsonStream } from '@votingworks/utils';
import { z } from 'zod';
import { LogEventId } from './log_event_ids';
// import { CLIENT_SIDE_LOG_SOURCES } from './base_types/log_source';
import { DEVICE_TYPES_FOR_APP, LogLineSchema } from './types';
import { Logger } from './logger';

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

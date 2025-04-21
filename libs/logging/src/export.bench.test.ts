/* eslint-disable no-console */
/* eslint @typescript-eslint/no-use-before-define: ["error", { "functions": false }] */

import { describe, test, vi } from 'vitest';
import { lines as lineIterator } from '@votingworks/basics';
import * as rustExporter from '@votingworks/logging-perf-test';
import { EventLogging } from '@votingworks/types';
import { createReadStream, createWriteStream, ReadStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline/promises';
import { jsonStream, JsonStreamInput, RawJson } from '@votingworks/utils';
import {
  DEVICE_TYPES_FOR_APP,
  LogEventId,
  Logger,
  LogSource,
  mockLogger,
} from '.';
import {
  buildCdfLog,
  buildCdfLogPreStringifyEvents,
  buildCdfLogPreStringifyEventsZ4,
  convertToCdfEventsNoZod,
} from './export';

vi.useFakeTimers().setSystemTime(new Date('2020-07-24T00:00:00.000Z'));

describe('buildCdfLog - perf', () => {
  const logger = mockLogger({
    source: LogSource.VxAdminFrontend,
    role: 'election_manager',
    fn: vi.fn,
  });

  const logFileName = 'smollog.vxlog';
  // const logFileName = 'biglog.vxlog';
  const machineId = '001';
  const ver = 'dev';

  test(
    'Rust exporter',
    async () => {
      console.time('Rust exporter');

      rustExporter.exportLog(
        join(__dirname, logFileName),
        join(__dirname, 'smollog-rust.cdf.log')
      );

      console.timeEnd('Rust exporter');
    },
    60_000 * 5
  );

  test(
    'ORIGINAL',
    async () => {
      console.time('ORIGINAL');

      await pipeline(
        createReadStream(join(__dirname, logFileName), 'utf8'),
        (inputStream: AsyncIterable<string>) =>
          buildCdfLog(logger, inputStream, machineId, ver),
        createWriteStream(join(__dirname, 'smollog.cdf.log'))
      );

      console.timeEnd('ORIGINAL');
    },
    60_000 * 5
  );

  test(
    'ORIGINAL - pre-stringify CDF event elements',
    async () => {
      console.time('ORIGINAL - pre-stringify');

      await pipeline(
        createReadStream(join(__dirname, logFileName), 'utf8'),
        (inputStream: AsyncIterable<string>) =>
          buildCdfLogPreStringifyEvents(logger, inputStream, machineId, ver),
        createWriteStream(join(__dirname, 'biglog.cdf.log'))
      );

      console.timeEnd('ORIGINAL - pre-stringify');
    },
    60_000 * 5
  );

  test(
    'ORIGINAL - pre-stringify CDF event elements - with Zod v4',
    async () => {
      console.time('ORIGINAL - pre-stringify - Zod4');

      await pipeline(
        createReadStream(join(__dirname, logFileName), 'utf8'),
        (inputStream: AsyncIterable<string>) =>
          buildCdfLogPreStringifyEventsZ4(logger, inputStream, machineId, ver),
        createWriteStream(join(__dirname, 'biglog.cdf.log'))
      );

      console.timeEnd('ORIGINAL - pre-stringify - Zod4');
    },
    60_000 * 5
  );

  test('Handwritten validation, pre-stringify CDF event elements', async () => {
    console.time('Hand-validate + pre-stringify ');

    await pipeline(
      createReadStream(join(__dirname, logFileName), 'utf8'),
      (inputStream: AsyncIterable<string>) =>
        buildCdfLogNoZod(logger, inputStream, machineId, ver),
      createWriteStream(join(__dirname, 'biglog.cdf.log'))
    );

    console.timeEnd('Hand-validate + pre-stringify ');
  }, 60_000);

  test('Handwritten validation, custom JSON writer', async () => {
    console.time('Hand-validate + custom JSON writer');

    await pipeline(
      createReadStream(join(__dirname, logFileName), 'utf8'),
      (inputStream: ReadStream) =>
        buildCdfLogNoJsonStream(logger, inputStream, machineId, ver),
      createWriteStream(join(__dirname, 'biglog.cdf.log'))
    );

    console.timeEnd('Hand-validate + custom JSON writer');
  }, 10_000);

  test('Handwritten validation, custom JSON writer, no NodeJS pipeline overhead', async () => {
    console.time('Hand-validate + manual pipeline');

    await buildCdfLogNoPipeline(logger, logFileName, machineId, ver);

    console.timeEnd('Hand-validate + manual pipeline');
  }, 10_000);
});

async function buildCdfLogNoPipeline(
  logger: Logger,
  logFileName: string,
  machineId: string,
  codeVersion: string
) {
  const outputFile = createWriteStream(join(__dirname, 'biglog.cdf.log'));
  outputFile.write(
    `{"@type":"EventLogging.ElectionEventLog",` +
      `"GeneratedTime":"${new Date().toISOString()}",` +
      `"Device":[{` +
      `"@type":"EventLogging.Device",` +
      `"Type":"${DEVICE_TYPES_FOR_APP[LogSource.VxAdminFrontend]}",` +
      `"Id":"${machineId}",` +
      `"Version":"${codeVersion}",` +
      `"Events":[`
  );

  const lines = readline.createInterface(
    createReadStream(join(__dirname, logFileName), 'utf8')
  );

  let idx = 0;
  let seq = 0;
  for await (const line of lines) {
    const event = convertToCdfEventsNoZod(logger, line, seq);
    seq += 1;

    if (event === null) continue;

    if (idx > 0) outputFile.write(',');
    outputFile.write(JSON.stringify(event));
    idx += 1;
  }

  outputFile.write(
    `]` + // end "Events"
      `}]` + // end "Device"
      `}` // end
  );
}

async function* buildCdfLogNoJsonStream(
  logger: Logger,
  logFileReader: ReadStream,
  machineId: string,
  codeVersion: string
): AsyncIterable<string> {
  yield `{"@type":"EventLogging.ElectionEventLog",` +
    `"GeneratedTime":"${new Date().toISOString()}",` +
    `"Device":[{` +
    `"@type":"EventLogging.Device",` +
    `"Type":"${DEVICE_TYPES_FOR_APP[LogSource.VxAdminFrontend]}",` +
    `"Id":"${machineId}",` +
    `"Version":"${codeVersion}",` +
    `"Events":[`;

  const lines = readline.createInterface(logFileReader);

  let idx = 0;
  let seq = 0;
  for await (const line of lines) {
    const event = convertToCdfEventsNoZod(logger, line, seq);
    seq += 1;

    if (event === null) continue;

    if (idx > 0) yield ',';
    yield JSON.stringify(event);
    idx += 1;
  }

  yield `]` + // end "Events"
    `}]` + // end "Device"
    `}`; // end
}

async function* cdfEventsNoZod(
  logger: Logger,
  logFileReader: AsyncIterable<string>
): AsyncGenerator<RawJson> {
  const lines = lineIterator(logFileReader).filter((l) => l !== '');

  let seq = 0;
  for await (const line of lines) {
    const event = convertToCdfEventsNoZod(logger, line, seq);
    seq += 1;

    if (event === null) continue;

    yield new RawJson(JSON.stringify(event));
  }
}

async function* buildCdfLogNoZod(
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
    Event: cdfEventsNoZod(logger, logFileReader),
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

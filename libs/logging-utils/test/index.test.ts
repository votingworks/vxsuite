import {
  LogEventId,
  LogEventType,
  Logger,
  LogLine,
  LogSource,
  mockLogger,
} from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { EventLogging, safeParseJson } from '@votingworks/types';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { assert, expect, test, vi } from 'vitest';
import { convertVxLogToCdf } from '..';

type Format = 'compressed' | 'uncompressed';

async function convertStringToCdf(
  logger: Logger,
  machineId: string,
  codeVersion: string,
  input: string,
  fmt: Format = 'uncompressed'
): Promise<string> {
  const compressed = fmt === 'compressed';
  const inputPath = makeTemporaryFile();
  await writeFile(inputPath, compressed ? zlib.gzipSync(input) : input);

  const outputPath = makeTemporaryFile();
  await new Promise<void>((resolve, reject) => {
    convertVxLogToCdf(
      (eventId, message, disposition) => {
        void logger.logAsCurrentRole(eventId, { message, disposition });
      },
      logger.getSource(),
      machineId,
      codeVersion,
      inputPath,
      outputPath,
      compressed,
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });

  if (!compressed) return await readFile(outputPath, 'utf8');

  return zlib.gunzipSync(await readFile(outputPath)).toString();
}

const testFormats = test.each<Format>(['compressed', 'uncompressed']);

testFormats('builds device and election info properly [$0]', async (fmt) => {
  const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
  const cdfLogContent = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    '',
    fmt
  );
  const cdfLog = safeParseJson(
    cdfLogContent,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(cdfLog.Device).toHaveLength(1);
  expect(cdfLog.ElectionId).toEqual(undefined);
  expect(cdfLog.GeneratedTime).toMatch(
    /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d+(Z|[-+]\d\d:\d\d)$/
  );
  const cdfLogDevice = cdfLog.Device?.[0];
  assert(cdfLogDevice);
  expect(cdfLogDevice.Id).toEqual('12machine34');
  expect(cdfLogDevice.Version).toEqual('thisisacodeversion');
  expect(cdfLogDevice.Type).toEqual('ems');
  expect(cdfLogDevice.Event).toStrictEqual([]);
});

testFormats('converts basic log as expected [$0]', async (fmt) => {
  const logger = mockLogger({
    source: LogSource.VxAdminFrontend,
    role: 'election_manager',
    fn: vi.fn,
  });
  const logSpy = vi.spyOn(logger, 'log').mockResolvedValue();
  const cdfLogContent = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-mount-init","eventType":"application-status","user":"system","message":"i know the deal","disposition":"na"}',
    fmt
  );
  const cdfLog = safeParseJson(
    cdfLogContent,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(cdfLog.Device).toHaveLength(1);
  const cdfLogDevice = cdfLog.Device?.[0];
  assert(cdfLogDevice);
  expect(cdfLogDevice.Event).toHaveLength(1);
  const decodedEvent = cdfLogDevice.Event?.[0];
  assert(decodedEvent);
  expect(decodedEvent.Id).toEqual(LogEventId.UsbDriveMountInit);
  expect(decodedEvent.Disposition).toEqual('na');
  expect(decodedEvent.Sequence).toEqual('0');
  expect(decodedEvent.TimeStamp).toEqual('2021-11-03T16:38:09.384062-07:00');
  expect(decodedEvent.Type).toEqual(LogEventType.ApplicationStatus);
  expect(decodedEvent.Description).toEqual('i know the deal');
  expect(decodedEvent.Details).toEqual(
    JSON.stringify({ source: 'vx-admin-frontend' })
  );
  expect('otherDisposition' in decodedEvent).toEqual(false);
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.LogConversionToCdfComplete,
    'election_manager',
    expect.objectContaining({
      message: 'Log file successfully converted to CDF format.',
      disposition: 'success',
    })
  );
});

testFormats('with unspecified disposition [$0]', async (fmt) => {
  const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
  const cdfLogContent = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-mount-init","eventType":"application-status","user":"system","message":"i know the deal","disposition":""}',
    fmt
  );
  const cdfLog = safeParseJson(
    cdfLogContent,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(cdfLog.Device).toHaveLength(1);
  const cdfLogDevice = cdfLog.Device?.[0];
  assert(cdfLogDevice);
  expect(cdfLogDevice.Event).toHaveLength(1);
  const decodedEvent = cdfLogDevice.Event?.[0];
  assert(decodedEvent);
  expect(decodedEvent.Disposition).toEqual('na');
});

testFormats('with custom disposition and extra details  [$0]', async (fmt) => {
  const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
  const cdfLogContent = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","host":"ubuntu","timeLogInitiated":"1635982689382","source":"vx-admin-frontend","eventId":"usb-drive-eject-complete","eventType":"application-status","user":"system","message":"glistened as it fell","disposition":"dinosaurs","newStatus":"absent"}',
    fmt
  );
  const cdfLog = safeParseJson(
    cdfLogContent,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(cdfLog.Device).toHaveLength(1);
  const cdfLogDevice = cdfLog.Device?.[0];
  assert(cdfLogDevice);
  expect(cdfLogDevice.Event).toHaveLength(1);
  const decodedEvent = cdfLogDevice.Event?.[0];
  assert(decodedEvent);
  expect(decodedEvent.Id).toEqual(LogEventId.UsbDriveEjected);
  expect(decodedEvent.Disposition).toEqual('other');
  expect(decodedEvent.OtherDisposition).toEqual('dinosaurs');
  expect(decodedEvent.Sequence).toEqual('0');
  expect(decodedEvent.TimeStamp).toEqual('2021-11-03T16:38:09.384062-07:00');
  expect(decodedEvent.Type).toEqual(LogEventType.ApplicationStatus);
  expect(decodedEvent.Description).toEqual('glistened as it fell');
  expect(JSON.parse(decodedEvent.Details!)).toEqual({
    host: 'ubuntu',
    newStatus: 'absent',
    source: 'vx-admin-frontend',
  });
});

testFormats('malformed logs are logged [$0]', async (fmt) => {
  const logger = mockLogger({
    source: LogSource.VxAdminFrontend,
    role: 'election_manager',
    fn: vi.fn,
  });
  const logSpy = vi.spyOn(logger, 'log').mockResolvedValue();
  const missingTimeLogLine: LogLine = {
    source: LogSource.System,
    eventId: LogEventId.DeviceAttached,
    eventType: LogEventType.ApplicationAction,
    user: 'system',
    disposition: 'na',
    message: 'message',
  };
  const missingTimeLog = JSON.stringify(missingTimeLogLine);
  const properLog = JSON.stringify({
    ...missingTimeLogLine,
    timeLogWritten: '2020-07-24T00:00:00.000Z',
  });
  const output = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    `rawr\n${properLog}\n`,
    fmt
  );
  const cdfLog = safeParseJson(
    output,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.LogConversionToCdfLogLineError,
    'election_manager',
    expect.objectContaining({
      message:
        'Malformed log (line 1) identified, log line will be ignored: rawr',
      disposition: 'failure',
    })
  );
  expect(cdfLog.Device?.[0]!.Event).toHaveLength(1);

  const output2 = await convertStringToCdf(
    logger,
    '12machine34',
    'thisisacodeversion',
    missingTimeLog,
    fmt
  );
  const cdfLog2 = safeParseJson(
    output2,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(logSpy).toHaveBeenCalledWith(
    LogEventId.LogConversionToCdfLogLineError,
    'election_manager',
    expect.objectContaining({
      message: `Malformed log (line 1) identified, log line will be ignored: ${missingTimeLog}`,
      disposition: 'failure',
    })
  );
  expect(cdfLog2.Device?.[0]!.Event).toStrictEqual([]);
});

testFormats('with real log file [$0]', async (fmt) => {
  const logFile = await readFile(
    join(__dirname, 'fixtures/samplelog.log'),
    'utf8'
  );
  const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
  const cdfLogContent = await convertStringToCdf(
    logger,
    '1234',
    'codeversion',
    logFile,
    fmt
  );
  const cdfLog = safeParseJson(
    cdfLogContent,
    EventLogging.ElectionEventLogSchema
  ).unsafeUnwrap();
  expect(cdfLog.Device).toHaveLength(1);
  expect(cdfLog.GeneratedTime).toMatch(
    /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d+(Z|[-+]\d\d:\d\d)$/
  );
  const cdfLogDevice = cdfLog.Device?.[0];
  assert(cdfLogDevice);
  expect(cdfLogDevice.Id).toEqual('1234');
  expect(cdfLogDevice.Version).toEqual('codeversion');
  expect(cdfLogDevice.Type).toEqual('ems');
  const events = cdfLogDevice.Event!;
  expect(events).toHaveLength(24);
  // There should be one auth-login log from the application logging.
  expect(events.filter((e) => e.Id === LogEventId.AuthLogin)).toHaveLength(1);
  // There should be 11 device-attached logs from the application logging.
  expect(events.filter((e) => e.Id === LogEventId.DeviceAttached)).toHaveLength(
    11
  );
  // There should be 4 usb-device-change-detected logs from the system logging.
  expect(
    events.filter((e) => e.Id === LogEventId.UsbDeviceChangeDetected)
  ).toHaveLength(4);
  // An application log should match the snapshot expected.
  expect(
    events
      .filter((e) => e.Id === LogEventId.AuthLogout)
      .map(({ Details: details, ...rest }) => ({
        ...rest,
        Details: JSON.parse(details as string),
      }))[0]
  ).toEqual({
    '@type': 'EventLogging.Event',
    Description: 'User logged out.',
    Details: { host: 'ubuntu', source: 'vx-admin-frontend' },
    Disposition: 'success',
    Id: 'auth-logout',
    Sequence: '23',
    TimeStamp: '2021-12-12T15:22:14.250052-08:00',
    Type: 'user-action',
    UserId: 'election_manager',
  });

  // A system log should match the snapshot expected.
  expect(
    events
      .filter((e) => e.Id === LogEventId.UsbDeviceChangeDetected)
      .map(({ Details: details, ...rest }) => ({
        ...rest,
        Details: JSON.parse(details as string),
      }))[0]
  ).toEqual({
    '@type': 'EventLogging.Event',
    Description: 'usblp1: removed',
    Details: { source: 'system', host: 'ubuntu' },
    Disposition: 'na',
    Id: 'usb-device-change-detected',
    Sequence: '17',
    TimeStamp: '2021-12-12T15:22:07.667632-08:00',
    Type: 'system-status',
    UserId: 'system',
  });
});

test('with a real logger', async () => {
  const logger = new Logger(LogSource.VxAdminFrontend, () =>
    Promise.resolve('system')
  );

  await suppressingConsoleOutput(() =>
    convertStringToCdf(logger, '12machine34', 'thisisacodeversion', '')
  );
});

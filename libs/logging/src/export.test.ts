import { describe, expect, test, vi } from 'vitest';
import { assert, iter } from '@votingworks/basics';
import { EventLogging, safeParseJson } from '@votingworks/types';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { LogEventId, LogEventType, LogLine, LogSource, mockLogger } from '.';
import { buildCdfLog, filterErrorLogs } from './export';

vi.useFakeTimers().setSystemTime(new Date('2020-07-24T00:00:00.000Z'));

describe('filterErrorLogs', () => {
  test('converts basic log as expected', async () => {
    const filteredErrorLogContent = filterErrorLogs(
      iter([
        // Log with NA disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"not an error","disposition":"na"}\n',
        // Log with success disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"not an error","disposition":"success"}\n',
        // Log with failure disposition
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error","disposition":"failure"}\na',
        // Invalid log
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error"}\na',
        // Invalid log
        'this is an invalid log line\n',
      ]).async()
    );
    const results = await iter(filteredErrorLogContent).toArray();
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i am an error","disposition":"failure"}'
    );
  });
});

describe('buildCdfLog', () => {
  test('builds device and election info properly', async () => {
    const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
    const cdfLogContent = buildCdfLog(
      logger,
      iter(['']).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult = safeParseJson(
      await iter(cdfLogContent).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device).toHaveLength(1);
    expect(cdfLog.ElectionId).toEqual(undefined);
    expect(cdfLog.GeneratedTime).toMatchInlineSnapshot(
      `"2020-07-24T00:00:00.000Z"`
    );
    const cdfLogDevice = cdfLog.Device?.[0];
    assert(cdfLogDevice);
    expect(cdfLogDevice.Id).toEqual('12machine34');
    expect(cdfLogDevice.Version).toEqual('thisisacodeversion');
    expect(cdfLogDevice.Type).toEqual('ems');
    expect(cdfLogDevice.Event).toStrictEqual([]);
  });

  test('converts basic log as expected', async () => {
    const logger = mockLogger({
      source: LogSource.VxAdminFrontend,
      role: 'election_manager',
      fn: vi.fn,
    });
    const logSpy = vi.spyOn(logger, 'log').mockResolvedValue();
    const cdfLogContent = buildCdfLog(
      logger,
      iter([
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-mount-init","eventType":"application-status","user":"system","message":"i know the deal","disposition":"na"}',
      ]).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult = safeParseJson(
      await iter(cdfLogContent).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
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

  test('log with unspecified disposition as expected', async () => {
    const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
    const cdfLogContent = buildCdfLog(
      logger,
      iter([
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-mount-init","eventType":"application-status","user":"system","message":"i know the deal","disposition":""}',
      ]).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult = safeParseJson(
      await iter(cdfLogContent).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device).toHaveLength(1);
    const cdfLogDevice = cdfLog.Device?.[0];
    assert(cdfLogDevice);
    expect(cdfLogDevice.Event).toHaveLength(1);
    const decodedEvent = cdfLogDevice.Event?.[0];
    assert(decodedEvent);
    expect(decodedEvent.Disposition).toEqual('na');
  });

  test('converts log with custom disposition and extra details as expected', async () => {
    const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
    const cdfLogContent = buildCdfLog(
      logger,
      iter([
        '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","host":"ubuntu","timeLogInitiated":"1635982689382","source":"vx-admin-frontend","eventId":"usb-drive-eject-complete","eventType":"application-status","user":"system","message":"glistened as it fell","disposition":"dinosaurs","newStatus":"absent"}',
      ]).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult = safeParseJson(
      await iter(cdfLogContent).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
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
    expect(decodedEvent.Details).toMatchInlineSnapshot(
      `"{"host":"ubuntu","newStatus":"absent","source":"vx-admin-frontend"}"`
    );
  });

  test('malformed logs are logged', async () => {
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
    const output = buildCdfLog(
      logger,
      iter([`rawr\n${properLog}\n`]).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult = safeParseJson(
      await iter(output).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(logSpy).toHaveBeenCalledWith(
      LogEventId.LogConversionToCdfLogLineError,
      'election_manager',
      expect.objectContaining({
        message:
          'Malformed log line identified, log line will be ignored: rawr ',
        disposition: 'failure',
      })
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device?.[0]!.Event).toHaveLength(1);

    const output2 = buildCdfLog(
      logger,
      iter(missingTimeLog).async(),
      '12machine34',
      'thisisacodeversion'
    );
    const cdfLogResult2 = safeParseJson(
      await iter(output2).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(logSpy).toHaveBeenCalledWith(
      LogEventId.LogConversionToCdfLogLineError,
      'election_manager',
      expect.objectContaining({
        message: `Malformed log line identified, log line will be ignored: ${missingTimeLog} `,
        disposition: 'failure',
      })
    );
    expect(cdfLogResult2.isOk()).toBeTruthy();
    const cdfLog2 = cdfLogResult2.ok();
    assert(cdfLog2);
    expect(cdfLog2.Device?.[0]!.Event).toStrictEqual([]);
  });

  test('read and interpret a real log file as expected', async () => {
    const logFile = createReadStream(
      join(__dirname, '../fixtures/samplelog.log')
    );
    const logger = mockLogger({ source: LogSource.VxAdminFrontend, fn: vi.fn });
    const cdfLogContent = buildCdfLog(logger, logFile, '1234', 'codeversion');
    const cdfLogResult = safeParseJson(
      await iter(cdfLogContent).toString(),
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device).toHaveLength(1);
    expect(cdfLog.GeneratedTime).toMatchInlineSnapshot(
      `"2020-07-24T00:00:00.000Z"`
    );
    const cdfLogDevice = cdfLog.Device?.[0];
    assert(cdfLogDevice);
    expect(cdfLogDevice.Id).toEqual('1234');
    expect(cdfLogDevice.Version).toEqual('codeversion');
    expect(cdfLogDevice.Type).toEqual('ems');
    const events = cdfLogDevice.Event!;
    // There are 25 log lines in the sample file.
    expect(events).toHaveLength(24);
    // There should be one auth-login log from the application logging.
    expect(events.filter((e) => e.Id === LogEventId.AuthLogin)).toHaveLength(1);
    // There should be 11 device-attached logs from the application logging.
    expect(
      events.filter((e) => e.Id === LogEventId.DeviceAttached)
    ).toHaveLength(11);
    // There should be 4 usb-device-change-detected logs from the system logging.
    expect(
      events.filter((e) => e.Id === LogEventId.UsbDeviceChangeDetected)
    ).toHaveLength(4);
    // An application log should match the snapshot expected.
    expect(events.filter((e) => e.Id === LogEventId.AuthLogout)[0])
      .toMatchInlineSnapshot(`
      {
        "@type": "EventLogging.Event",
        "Description": "User logged out.",
        "Details": "{"host":"ubuntu","source":"vx-admin-frontend"}",
        "Disposition": "success",
        "Id": "auth-logout",
        "Sequence": "23",
        "TimeStamp": "2021-12-12T15:22:14.250052-08:00",
        "Type": "user-action",
        "UserId": "election_manager",
      }
    `);

    // A system log should match the snapshot expected.
    expect(events.filter((e) => e.Id === LogEventId.UsbDeviceChangeDetected)[0])
      .toMatchInlineSnapshot(`
      {
        "@type": "EventLogging.Event",
        "Description": "usblp1: removed",
        "Details": "{"host":"ubuntu","source":"system"}",
        "Disposition": "na",
        "Id": "usb-device-change-detected",
        "Sequence": "17",
        "TimeStamp": "2021-12-12T15:22:07.667632-08:00",
        "Type": "system-status",
        "UserId": "system",
      }
    `);
  });
});

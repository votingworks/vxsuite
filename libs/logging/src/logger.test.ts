/* eslint-disable no-console */
import { fakeKiosk } from '@votingworks/test-utils';
import { readFileSync } from 'fs-extra';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import MockDate from 'mockdate';
import { join } from 'path';
import { safeParseJson, EventLogging } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { LogEventId } from './log_event_ids';
import { Logger } from './logger';
import { LogEventType } from './log_event_types';
import {
  DEVICE_TYPES_FOR_APP,
  LogDispositionStandardTypes,
  LogLine,
} from './types';
import { CLIENT_SIDE_LOG_SOURCES, LogSource } from './log_source';

MockDate.set('2020-07-24T00:00:00.000Z');

test('logger logs server logs as expected', async () => {
  console.log = jest.fn();
  const logger = new Logger(LogSource.System);
  await logger.log(LogEventId.MachineBootInit, 'system', {
    message: 'I come back stronger than a 90s trend',
    disposition: LogDispositionStandardTypes.Success,
    reputation: 'callitwhatyouwant',
  });
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.System,
      eventId: LogEventId.MachineBootInit,
      eventType: LogEventType.SystemAction,
      user: 'system',
      message: 'I come back stronger than a 90s trend',
      disposition: LogDispositionStandardTypes.Success,
      reputation: 'callitwhatyouwant',
    })
  );
});

test('logger logs client logs as expected through kiosk browser with overridden message', async () => {
  console.log = jest.fn();
  const kiosk = fakeKiosk();
  const logger = new Logger(LogSource.VxAdminFrontend, kiosk);
  await logger.log(LogEventId.ElectionConfigured, 'election_manager', {
    message: 'On my tallest tiptoes',
    disposition: LogDispositionStandardTypes.NotApplicable,
    folklore: 'mirrorball',
  });
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 24).getTime().toString(),
      source: LogSource.VxAdminFrontend,
      eventId: LogEventId.ElectionConfigured,
      eventType: LogEventType.UserAction,
      user: 'election_manager',
      message: 'On my tallest tiptoes', // overrides the default message
      disposition: LogDispositionStandardTypes.NotApplicable,
      folklore: 'mirrorball',
    })
  );
  expect(console.log).not.toHaveBeenCalled();
});

test('defaults to default message when defined and no disposition', async () => {
  console.log = jest.fn();
  const kiosk = fakeKiosk();
  const logger = new Logger(LogSource.VxAdminFrontend, kiosk);
  await logger.log(LogEventId.ElectionUnconfigured, 'election_manager');
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 24).getTime().toString(),
      source: LogSource.VxAdminFrontend,
      eventId: LogEventId.ElectionUnconfigured,
      eventType: LogEventType.UserAction,
      user: 'election_manager',
      message: 'Application has been unconfigured from the previous election.',
      disposition: LogDispositionStandardTypes.NotApplicable,
    })
  );
  expect(console.log).not.toHaveBeenCalled();
});

test('logs unknown disposition as expected', async () => {
  console.log = jest.fn();
  const logger = new Logger(LogSource.System);
  await logger.log(LogEventId.MachineBootComplete, 'system', {
    message: 'threw out our cloaks and our daggers now',
    disposition: 'daylight',
    maybe: 'you',
    ran: 'with',
    the: 'wolves',
  });
  expect(console.log).toHaveBeenCalledWith(
    JSON.stringify({
      source: LogSource.System,
      eventId: LogEventId.MachineBootComplete,
      eventType: LogEventType.SystemStatus,
      user: 'system',
      message: 'threw out our cloaks and our daggers now',
      disposition: 'daylight',
      maybe: 'you',
      ran: 'with',
      the: 'wolves',
    })
  );
});

test('logging from a client side app without sending window.kiosk does NOT log to console', async () => {
  console.log = jest.fn();
  const logger = new Logger(LogSource.VxAdminFrontend);
  await logger.log(LogEventId.AuthLogin, 'election_manager');
  expect(console.log).not.toHaveBeenCalled();
});

test('verify that client side apps are configured properly', () => {
  for (const source of CLIENT_SIDE_LOG_SOURCES) {
    expect(source in DEVICE_TYPES_FOR_APP).toBeTruthy();
  }
});

describe('test cdf conversion', () => {
  test('builds device and election info properly', () => {
    const logger = new Logger(LogSource.VxAdminFrontend);
    const cdfLogContent = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      '',
      '12machine34',
      'thisisacodeversion',
      'election_manager'
    );
    const cdfLogResult = safeParseJson(
      cdfLogContent,
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device).toHaveLength(1);
    expect(cdfLog.ElectionId).toEqual(
      electionMinimalExhaustiveSampleDefinition.electionHash
    );
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

  test('converts basic log as expected', () => {
    const logger = new Logger(LogSource.VxAdminFrontend);
    const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
    const cdfLogContent = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i know the deal","disposition":"na"}',
      '12machine34',
      'thisisacodeversion',
      'election_manager'
    );
    const cdfLogResult = safeParseJson(
      cdfLogContent,
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
    expect(decodedEvent.Id).toEqual(LogEventId.UsbDriveDetected);
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

  test('log with unspecified disposition as expected', () => {
    const logger = new Logger(LogSource.VxAdminFrontend);
    const cdfLogContent = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"i know the deal","disposition":""}',
      '12machine34',
      'thisisacodeversion',
      'election_manager'
    );
    const cdfLogResult = safeParseJson(
      cdfLogContent,
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

  test('converts log with custom disposition and extra details as expected', () => {
    const logger = new Logger(LogSource.VxAdminFrontend);
    const cdfLogContent = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      '{"timeLogWritten":"2021-11-03T16:38:09.384062-07:00","host":"ubuntu","timeLogInitiated":"1635982689382","source":"vx-admin-frontend","eventId":"usb-drive-detected","eventType":"application-status","user":"system","message":"glistened as it fell","disposition":"dinosaurs","newStatus":"absent"}',
      '12machine34',
      'thisisacodeversion',
      'election_manager'
    );
    const cdfLogResult = safeParseJson(
      cdfLogContent,
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
    expect(decodedEvent.Id).toEqual(LogEventId.UsbDriveDetected);
    expect(decodedEvent.Disposition).toEqual('other');
    expect(decodedEvent.OtherDisposition).toEqual('dinosaurs');
    expect(decodedEvent.Sequence).toEqual('0');
    expect(decodedEvent.TimeStamp).toEqual('2021-11-03T16:38:09.384062-07:00');
    expect(decodedEvent.Type).toEqual(LogEventType.ApplicationStatus);
    expect(decodedEvent.Description).toEqual('glistened as it fell');
    expect(decodedEvent.Details).toMatchInlineSnapshot(
      `"{\\"host\\":\\"ubuntu\\",\\"newStatus\\":\\"absent\\",\\"source\\":\\"vx-admin-frontend\\"}"`
    );
  });

  test('non frontend apps can not export cdf logs', () => {
    const logger = new Logger(LogSource.System);
    const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
    expect(() =>
      logger.buildCDFLog(
        electionMinimalExhaustiveSampleDefinition,
        '',
        '12machine34',
        'thisisacodeversion',
        'election_manager'
      )
    ).toThrowError('Can only export CDF logs from a frontend app.');
    expect(logSpy).toHaveBeenCalledWith(
      LogEventId.LogConversionToCdfComplete,
      'election_manager',
      expect.objectContaining({
        message: 'The current application is not able to export logs.',
        disposition: 'failure',
      })
    );
  });

  test('malformed logs are logged', () => {
    const logger = new Logger(LogSource.VxAdminFrontend);
    const logSpy = jest.spyOn(logger, 'log').mockResolvedValue();
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
    const output = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      `rawr\n${properLog}\n`,
      '12machine34',
      'thisisacodeversion',
      'election_manager'
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
    const cdfLogResult = safeParseJson(
      output,
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device?.[0]!.Event).toHaveLength(1);

    const output2 = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      missingTimeLog,
      '12machine34',
      'thisisacodeversion',
      'election_manager'
    );
    expect(logSpy).toHaveBeenCalledWith(
      LogEventId.LogConversionToCdfLogLineError,
      'election_manager',
      expect.objectContaining({
        message: `Malformed log line identified, log line will be ignored: ${missingTimeLog} `,
        disposition: 'failure',
      })
    );
    const cdfLogResult2 = safeParseJson(
      output2,
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult2.isOk()).toBeTruthy();
    const cdfLog2 = cdfLogResult2.ok();
    assert(cdfLog2);
    expect(cdfLog2.Device?.[0]!.Event).toStrictEqual([]);
  });

  test('read and interpret a real log file as expected', () => {
    const logFile = readFileSync(join(__dirname, '../fixtures/samplelog.log'));
    const logger = new Logger(LogSource.VxAdminFrontend);
    const cdfLogContent = logger.buildCDFLog(
      electionMinimalExhaustiveSampleDefinition,
      logFile.toString(),
      '1234',
      'codeversion',
      'vx-staff'
    );
    const cdfLogResult = safeParseJson(
      cdfLogContent,
      EventLogging.ElectionEventLogSchema
    );
    expect(cdfLogResult.isOk()).toBeTruthy();
    const cdfLog = cdfLogResult.ok();
    assert(cdfLog);
    expect(cdfLog.Device).toHaveLength(1);
    expect(cdfLog.ElectionId).toEqual(
      electionMinimalExhaustiveSampleDefinition.electionHash
    );
    expect(cdfLog.GeneratedTime).toMatchInlineSnapshot(
      `"2020-07-24T00:00:00.000Z"`
    );
    const cdfLogDevice = cdfLog.Device?.[0];
    assert(cdfLogDevice);
    expect(cdfLogDevice.Id).toEqual('1234');
    expect(cdfLogDevice.Version).toEqual('codeversion');
    expect(cdfLogDevice.Type).toEqual('ems');
    const events = cdfLogDevice.Event!;
    // There are 35 log lines in the sample file.
    expect(events).toHaveLength(35);
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
      Object {
        "@type": "EventLogging.Event",
        "Description": "User logged out.",
        "Details": "{\\"host\\":\\"ubuntu\\",\\"source\\":\\"vx-admin-frontend\\"}",
        "Disposition": "success",
        "Id": "auth-logout",
        "Sequence": "31",
        "TimeStamp": "2021-12-12T15:22:14.250052-08:00",
        "Type": "user-action",
        "UserId": "election_manager",
      }
    `);

    // A system log should match the snapshot expected.
    expect(events.filter((e) => e.Id === LogEventId.UsbDeviceChangeDetected)[0])
      .toMatchInlineSnapshot(`
      Object {
        "@type": "EventLogging.Event",
        "Description": "usblp1: removed",
        "Details": "{\\"host\\":\\"ubuntu\\",\\"source\\":\\"system\\"}",
        "Disposition": "na",
        "Id": "usb-device-change-detected",
        "Sequence": "25",
        "TimeStamp": "2021-12-12T15:22:07.667632-08:00",
        "Type": "system-status",
        "UserId": "system",
      }
    `);
  });
});

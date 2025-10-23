/* eslint-disable no-console */
import { beforeEach, expect, test, vi } from 'vitest';
import { mockKiosk } from '@votingworks/test-utils';
import { LogEventId, LogEventType, LogSource } from './log_event_enums';
import { BaseLogger, CLIENT_SIDE_LOG_SOURCES } from './base_logger';
import { DEVICE_TYPES_FOR_APP, LogDispositionStandardTypes } from './types';

vi.useFakeTimers();

beforeEach(() => {
  vi.setSystemTime(new Date('2020-07-24T00:00:00.000Z'));
});

test('logger logs server logs as expected', () => {
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.System);
  logger.log(LogEventId.MachineBootInit, 'system', {
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

test('logger logs client logs as expected through kiosk browser with overridden message', () => {
  console.log = vi.fn();
  const kiosk = mockKiosk(vi.fn);
  const logger = new BaseLogger(LogSource.VxAdminFrontend, kiosk);
  logger.log(LogEventId.ElectionConfigured, 'election_manager', {
    message: 'On my tallest tiptoes',
    disposition: LogDispositionStandardTypes.NotApplicable,
    folklore: 'mirrorball',
  });
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 23, 16).getTime().toString(),
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

test('defaults to default message when defined and no disposition', () => {
  console.log = vi.fn();
  const kiosk = mockKiosk(vi.fn);
  const logger = new BaseLogger(LogSource.VxAdminFrontend, kiosk);
  logger.log(LogEventId.ElectionUnconfigured, 'election_manager');
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 23, 16).getTime().toString(),
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

test('logs unknown disposition as expected', () => {
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.System);
  logger.log(LogEventId.MachineBootComplete, 'system', {
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

test('logging from a client side app without sending window.kiosk does NOT log to console', () => {
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.VxAdminFrontend);
  logger.log(LogEventId.AuthLogin, 'election_manager');
  expect(console.log).not.toHaveBeenCalled();
});

test('verify that client side apps are configured properly', () => {
  for (const source of CLIENT_SIDE_LOG_SOURCES) {
    expect(source in DEVICE_TYPES_FOR_APP).toBeTruthy();
  }
});

test.each<{
  description: string;
  input: Array<{ message: string }>;
  timeBetweenLogsMs: number;
  output: Array<{
    message: string;
    repeatCount?: string;
    firstRepeatAt?: string;
    lastRepeatAt?: string;
  }>;
}>([
  {
    description: 'no repeats',
    input: [
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
    ],
  },
  {
    description: 'repeats where logging trigger is end of repeats',
    input: [
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '2',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:01.000Z',
      },
      { message: 'Scanner is off' },
    ],
  },
  {
    description: 'repeats where logging trigger is count of repeats',
    input: [
      ...Array.from<{ message: string }>({ length: 101 }).fill({
        message: 'Scanner is on',
      }),
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '100',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:50.000Z',
      },
    ],
  },
  {
    description:
      'repeats where logging trigger is time between first and last repeat',
    input: [
      ...Array.from<{ message: string }>({ length: 70 }).fill({
        message: 'Scanner is on',
      }),
    ],
    timeBetweenLogsMs: 1000,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '61',
        firstRepeatAt: '2020-07-24T00:00:01.000Z',
        lastRepeatAt: '2020-07-24T00:01:01.000Z',
      },
    ],
  },
  {
    description: 'single repeat where logging trigger is end of repeats',
    input: [
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '1',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:00.500Z',
      },
      { message: 'Scanner is off' },
    ],
  },
  {
    description: 'consecutive repeats where logging trigger is end of repeats',
    input: [
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      { message: 'Scanner is off' },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '2',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:01.000Z',
      },
      { message: 'Scanner is off' },
      {
        message: 'Scanner is off',
        repeatCount: '2',
        firstRepeatAt: '2020-07-24T00:00:02.000Z',
        lastRepeatAt: '2020-07-24T00:00:02.500Z',
      },
      { message: 'Scanner is on' },
    ],
  },
  {
    description: 'repeats where logging triggers are varied',
    input: [
      ...Array.from<{ message: string }>({ length: 120 }).fill({
        message: 'Scanner is on',
      }),
      { message: 'Scanner is off' },
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '100',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:50.000Z',
      },
      {
        message: 'Scanner is on',
        repeatCount: '19',
        firstRepeatAt: '2020-07-24T00:00:50.500Z',
        lastRepeatAt: '2020-07-24T00:00:59.500Z',
      },
      { message: 'Scanner is off' },
    ],
  },
  {
    description:
      'repeats where logging trigger is count of repeats, multiple logs emitted',
    input: [
      ...Array.from<{ message: string }>({ length: 201 }).fill({
        message: 'Scanner is on',
      }),
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '100',
        firstRepeatAt: '2020-07-24T00:00:00.500Z',
        lastRepeatAt: '2020-07-24T00:00:50.000Z',
      },
      {
        message: 'Scanner is on',
        repeatCount: '100',
        firstRepeatAt: '2020-07-24T00:00:50.500Z',
        lastRepeatAt: '2020-07-24T00:01:40.000Z',
      },
    ],
  },
  {
    description:
      'repeats where logging trigger is time between first and last repeat, multiple logs emitted',
    input: [
      ...Array.from<{ message: string }>({ length: 130 }).fill({
        message: 'Scanner is on',
      }),
    ],
    timeBetweenLogsMs: 1000,
    output: [
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '61',
        firstRepeatAt: '2020-07-24T00:00:01.000Z',
        lastRepeatAt: '2020-07-24T00:01:01.000Z',
      },
      {
        message: 'Scanner is on',
        repeatCount: '61',
        firstRepeatAt: '2020-07-24T00:01:02.000Z',
        lastRepeatAt: '2020-07-24T00:02:02.000Z',
      },
    ],
  },
  {
    description: 'first log is not repeat, various repeats after',
    input: [
      // In most other test cases we dive right into the repeats. Here we intentionally begin
      // without a repeat.
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      { message: 'Scanner is off' },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
      ...Array.from<{ message: string }>({ length: 101 }).fill({
        message: 'Scanner is off',
      }),
    ],
    timeBetweenLogsMs: 500,
    output: [
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      {
        message: 'Scanner is off',
        repeatCount: '2',
        firstRepeatAt: '2020-07-24T00:00:01.000Z',
        lastRepeatAt: '2020-07-24T00:00:01.500Z',
      },
      { message: 'Scanner is on' },
      {
        message: 'Scanner is on',
        repeatCount: '1',
        firstRepeatAt: '2020-07-24T00:00:02.500Z',
        lastRepeatAt: '2020-07-24T00:00:02.500Z',
      },
      { message: 'Scanner is off' },
      { message: 'Scanner is on' },
      { message: 'Scanner is off' },
      {
        message: 'Scanner is off',
        repeatCount: '100',
        firstRepeatAt: '2020-07-24T00:00:04.500Z',
        lastRepeatAt: '2020-07-24T00:00:54.000Z',
      },
    ],
  },
])(
  'repeat log handling - $description',
  ({ input, output, timeBetweenLogsMs }) => {
    console.log = vi.fn();
    const logger = new BaseLogger(LogSource.VxScanBackend);

    for (const log of input) {
      logger.log(LogEventId.ScannerEvent, 'system', log);
      vi.advanceTimersByTime(timeBetweenLogsMs);
    }

    expect(console.log).toHaveBeenCalledTimes(output.length);
    for (const [index, log] of output.entries()) {
      expect(console.log).toHaveBeenNthCalledWith(
        index + 1,
        JSON.stringify({
          source: LogSource.VxScanBackend,
          eventId: LogEventId.ScannerEvent,
          eventType: LogEventType.ApplicationAction,
          user: 'system',
          message: log.message,
          disposition: LogDispositionStandardTypes.NotApplicable,
          repeatCount: log.repeatCount,
          firstRepeatAt: log.firstRepeatAt,
          lastRepeatAt: log.lastRepeatAt,
        })
      );
    }
  }
);

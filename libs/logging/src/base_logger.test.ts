/* eslint-disable no-console */
import { expect, test, vi } from 'vitest';
import { mockKiosk } from '@votingworks/test-utils';
import { LogEventId } from './log_event_ids';
import { LogEventType } from './base_types/log_event_types';
import { CLIENT_SIDE_LOG_SOURCES, LogSource } from './base_types/log_source';
import { BaseLogger } from './base_logger';
import { DEVICE_TYPES_FOR_APP, LogDispositionStandardTypes } from './types';

vi.useFakeTimers().setSystemTime(new Date('2020-07-24T00:00:00.000Z'));

test('logger logs server logs as expected', async () => {
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.System);
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
  console.log = vi.fn();
  const kiosk = mockKiosk(vi.fn);
  const logger = new BaseLogger(LogSource.VxAdminFrontend, kiosk);
  await logger.log(LogEventId.ElectionConfigured, 'election_manager', {
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

test('defaults to default message when defined and no disposition', async () => {
  console.log = vi.fn();
  const kiosk = mockKiosk(vi.fn);
  const logger = new BaseLogger(LogSource.VxAdminFrontend, kiosk);
  await logger.log(LogEventId.ElectionUnconfigured, 'election_manager');
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

test('logs unknown disposition as expected', async () => {
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.System);
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
  console.log = vi.fn();
  const logger = new BaseLogger(LogSource.VxAdminFrontend);
  await logger.log(LogEventId.AuthLogin, 'election_manager');
  expect(console.log).not.toHaveBeenCalled();
});

test('verify that client side apps are configured properly', () => {
  for (const source of CLIENT_SIDE_LOG_SOURCES) {
    expect(source in DEVICE_TYPES_FOR_APP).toBeTruthy();
  }
});

/* eslint-disable no-console */
import { fakeKiosk } from '@votingworks/test-utils';
import MockDate from 'mockdate';
import { LogEventType } from '.';
import { LogEventId } from './log_event_ids';
import { Logger } from './logger';
import { LogDispositionStandardTypes, LogSource } from './types';

MockDate.set('2020-07-24T00:00:00.000Z');

test('logger logs server logs as expected', async () => {
  console.log = jest.fn();
  const logger = new Logger(LogSource.System);
  await logger.log(LogEventId.MachineBootInit, 'system', {
    message: 'I come back stronger than a 90s trend',
    disposition: LogDispositionStandardTypes.Success,
    reputation: 'callitwhatyouwant',
  });
  expect(console.log).toHaveBeenCalledWith({
    source: LogSource.System,
    eventId: LogEventId.MachineBootInit,
    eventType: LogEventType.SystemAction,
    user: 'system',
    message: 'I come back stronger than a 90s trend',
    disposition: LogDispositionStandardTypes.Success,
    reputation: 'callitwhatyouwant',
  });
});

test('logger logs client logs as expected through kiosk browser with overridden message', async () => {
  console.log = jest.fn();
  const kiosk = fakeKiosk();
  const logger = new Logger(LogSource.VxAdminApp, kiosk);
  await logger.log(LogEventId.ElectionConfigured, 'admin', {
    message: 'On my tallest tiptoes',
    disposition: LogDispositionStandardTypes.NotApplicable,
    folklore: 'mirrorball',
  });
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 24).getTime().toString(),
      source: LogSource.VxAdminApp,
      eventId: LogEventId.ElectionConfigured,
      eventType: LogEventType.UserAction,
      user: 'admin',
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
  const logger = new Logger(LogSource.VxAdminApp, kiosk);
  await logger.log(LogEventId.ElectionUnconfigured, 'admin');
  expect(kiosk.log).toHaveBeenCalledTimes(1);
  expect(kiosk.log).toHaveBeenCalledWith(
    JSON.stringify({
      timeLogInitiated: new Date(2020, 6, 24).getTime().toString(),
      source: LogSource.VxAdminApp,
      eventId: LogEventId.ElectionUnconfigured,
      eventType: LogEventType.UserAction,
      user: 'admin',
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
  expect(console.log).toHaveBeenCalledWith({
    source: LogSource.System,
    eventId: LogEventId.MachineBootComplete,
    eventType: LogEventType.SystemStatus,
    user: 'system',
    message: 'threw out our cloaks and our daggers now',
    disposition: 'daylight',
    maybe: 'you',
    ran: 'with',
    the: 'wolves',
  });
});

test('logging from a client side app without sending window.kiosk does NOT log to console', async () => {
  console.log = jest.fn();
  const logger = new Logger(LogSource.VxAdminApp);
  await logger.log(LogEventId.AdminCardInserted, 'admin');
  expect(console.log).not.toHaveBeenCalled();
});

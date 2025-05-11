/* eslint-disable no-console */
import { expect, test, vi } from 'vitest';
import { LogEventId, LogEventType, LogSource } from './log_event_enums';
import { BaseLogger } from './base_logger';
import { LogDispositionStandardTypes } from './types';

vi.useFakeTimers().setSystemTime(new Date('2020-07-24T00:00:00.000Z'));

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

import { expect, test } from 'vitest';
import { getDocumentationForEventType, LogEventType } from './log_event_types';

test('getDocumentationForEventType implemented for all log event types properly', () => {
  for (const eventType of Object.values(LogEventType)) {
    const documentation = getDocumentationForEventType(eventType);
    expect(documentation.eventType).toEqual(eventType);
  }
});

test('getDocumentationForEventType rejects invalid event types', () => {
  // @ts-expect-error - invalid type
  expect(() => getDocumentationForEventType('invalid')).toThrow();
});

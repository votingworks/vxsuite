import { expect, test } from 'vitest';
import {
  getDocumentationForEventType,
  getDetailsForEventId,
  LogEventId,
  LogEventType,
} from './log_event_enums';

test('getDetailsForEventId implemented for all events properly', () => {
  for (const eventId of Object.values(LogEventId)) {
    const logDetails = getDetailsForEventId(eventId);
    expect(logDetails.eventId).toEqual(eventId);
  }
});

test('getDefaultsForEventId rejects invalid event IDs', () => {
  // @ts-expect-error - invalid value
  expect(() => getDetailsForEventId('invalid')).toThrow();
});

test('all event Ids are unique', () => {
  const allEventIds = Object.values(LogEventId);
  for (const eventId of allEventIds) {
    expect(allEventIds.filter((e) => e === eventId)).toHaveLength(1);
  }
});

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

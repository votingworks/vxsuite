import { getDocumentationForEventType, LogEventType } from './logEventTypes';

test('getDocumentationForEventType implemented for all log event types properly', () => {
  for (const eventType of Object.values(LogEventType)) {
    const documentation = getDocumentationForEventType(eventType);
    expect(documentation.eventType).toEqual(eventType);
  }
});

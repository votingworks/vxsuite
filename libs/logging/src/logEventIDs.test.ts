import { getDetailsForEventId, LogEventId } from './logEventIDs';

test('getDetailsForEventId implemented for all events properly', () => {
  for (const eventId of Object.values(LogEventId)) {
    const logDetails = getDetailsForEventId(eventId);
    expect(logDetails.eventId).toEqual(eventId);
  }
});

test('all event Ids are unique', () => {
  const allEventIds = Object.values(LogEventId);
  for (const eventId of allEventIds) {
    expect(allEventIds.filter((e) => e === eventId)).toHaveLength(1);
  }
});

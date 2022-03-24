import { DateTime } from 'luxon';
import {
  formatFullDateTimeZone,
  formatLongDate,
  formatTime,
  formatTimeZoneName,
  getDaysInMonth,
} from './date';

test('formatTimeZoneName', () => {
  expect(
    formatTimeZoneName(
      DateTime.fromISO('2021-01-01', { zone: 'America/Los_Angeles' })
    )
  ).toEqual('Pacific Standard Time');
  expect(
    formatTimeZoneName(
      DateTime.fromISO('2021-05-01', { zone: 'America/Los_Angeles' })
    )
  ).toEqual('Pacific Daylight Time');
  expect(
    formatTimeZoneName(
      DateTime.fromISO('2021-01-01', { zone: 'America/New_York' })
    )
  ).toEqual('Eastern Standard Time');
  expect(
    formatTimeZoneName(
      DateTime.fromISO('2021-05-01', { zone: 'America/New_York' })
    )
  ).toEqual('Eastern Daylight Time');
});

test('formatFullDateTimeZone', () => {
  expect(
    formatFullDateTimeZone(
      DateTime.fromISO('2021-01-01', { zone: 'America/Los_Angeles' })
    )
  ).toEqual('Fri, Jan 1, 2021, 12:00 AM');
  expect(
    formatFullDateTimeZone(
      DateTime.fromISO('2021-12-31', { zone: 'America/Los_Angeles' })
    )
  ).toEqual('Fri, Dec 31, 2021, 12:00 AM');
  expect(
    formatFullDateTimeZone(
      DateTime.fromISO('2021-01-01', { zone: 'America/Los_Angeles' }),
      { includeTimezone: true }
    )
  ).toEqual('Fri, Jan 1, 2021, 12:00 AM PST');
  expect(
    formatFullDateTimeZone(
      DateTime.fromISO('2021-07-31', { zone: 'America/Los_Angeles' }),
      { includeTimezone: true }
    )
  ).toEqual('Sat, Jul 31, 2021, 12:00 AM PDT');
});

test('formatLongDate', () => {
  expect(
    formatLongDate(
      DateTime.fromISO('2021-01-01', { zone: 'America/Chicago' }),
      'America/Chicago'
    )
  ).toEqual('January 1, 2021');
  expect(
    formatLongDate(
      DateTime.fromISO('2021-12-31', { zone: 'America/Chicago' }),
      'America/Chicago'
    )
  ).toEqual('December 31, 2021');
});

test('formatTime', () => {
  expect(formatTime(DateTime.fromISO('2021-01-01'))).toEqual('12:00 AM');
  expect(formatTime(DateTime.fromISO('2021-01-01T01:23:45Z'))).toEqual(
    '1:23 AM'
  );
  expect(formatTime(DateTime.fromISO('2021-01-01T14:41:00Z'))).toEqual(
    '2:41 PM'
  );
});

test('getDaysInMonth', () => {
  const januaryDays = getDaysInMonth(2021, 1);
  expect(januaryDays).toHaveLength(31);
  expect(januaryDays[0]).toEqual(DateTime.fromISO('2021-01-01'));

  const februaryDays = getDaysInMonth(2021, 2);
  expect(februaryDays).toHaveLength(28);
  expect(februaryDays[0]).toEqual(DateTime.fromISO('2021-02-01'));
});

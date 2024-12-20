import { DateTime, Duration } from 'luxon';
import { find } from '@votingworks/basics';

export const AMERICA_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
];

function* getShortMonthNames(): Generator<string> {
  const monthShortNameFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
  });
  const year = new Date().getFullYear();
  for (
    let month = 0;
    new Date(year, month, 1).getFullYear() === year;
    month += 1
  ) {
    yield monthShortNameFormatter.format(new Date(year, month, 1));
  }
}
export const MONTHS_SHORT = [...getShortMonthNames()];

export function formatTimeZoneName(date: DateTime): string {
  return find(
    new Intl.DateTimeFormat(undefined, {
      timeZoneName: 'long',
      timeZone: date.zoneName,
    }).formatToParts(date.toJSDate()),
    (part) => part.type === 'timeZoneName'
  ).value;
}

export function formatFullDateTimeZone(
  date: DateTime,
  { includeTimezone = false, includeWeekday = true } = {}
): string | undefined {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: date.zoneName,
    weekday: includeWeekday ? 'short' : undefined,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: includeTimezone ? 'short' : undefined,
  }).format(date.toJSDate());
}

export function formatLongDate(date: DateTime, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date.toJSDate());
}

export function formatShortDate(date: DateTime, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date.toJSDate());
}

export function formatTime(date: DateTime): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: date.zoneName,
    hour: 'numeric',
    minute: 'numeric',
  }).format(date.toJSDate());
}

/**
 * Get days in given month and year.
 */
export function getDaysInMonth(year: number, month: number): DateTime[] {
  let date = DateTime.fromObject({ year, month, day: 1 });
  const days = [];
  while (date.month === month) {
    days.push(date);
    date = date.plus(Duration.fromObject({ day: 1 }));
  }
  return days;
}

/**
 * Returns current UTC unix timestamp (epoch) in seconds
 */
export function utcTimestamp(): number {
  return Math.round(Date.now() / 1000);
}

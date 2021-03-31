import { DateTime, Duration } from 'luxon'
import moment from 'moment'

export const AMERICA_TIMEZONES = [
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
]

function* getShortMonthNames(): Generator<string> {
  const monthShortNameFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
  })
  const year = new Date().getFullYear()
  for (
    let month = 0;
    new Date(year, month, 1).getFullYear() === year;
    month++
  ) {
    yield monthShortNameFormatter.format(new Date(year, month, 1))
  }
}
export const MONTHS_SHORT = [...getShortMonthNames()]

export const formatTimeZoneName = (date: DateTime): string | undefined =>
  new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'long',
    timeZone: date.zoneName,
  })
    .formatToParts(date.toJSDate())
    .find((part) => part.type === 'timeZoneName')?.value

export const formatFullDateTimeZone = (
  date: DateTime,
  includeTimezone = false
): string | undefined =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: date.zoneName,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: includeTimezone ? 'short' : undefined,
  }).format(date.toJSDate())

export const formatLongDate = (date: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

// TODO: replace `dateLong` with `formatLongDate`
export const dateLong = (dateString: string): string =>
  moment(new Date(dateString)).format('LL')

/**
 * Get days in given month and year.
 */
export function getDaysInMonth(year: number, month: number): DateTime[] {
  let date = DateTime.fromObject({ year, month, day: 1 })
  const days = []
  while (date.month === month) {
    days.push(date)
    date = date.plus(Duration.fromObject({ day: 1 }))
  }
  return days
}

/**
 * Determines whether two dates are the same day in the current timezone.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return formatLongDate(a) === formatLongDate(b)
}

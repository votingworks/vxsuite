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

export const formatTimeZoneName = (
  date: Date,
  timeZone?: string
): string | undefined =>
  new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'long',
    timeZone,
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value

export const formatFullDateTimeZone = (
  date: Date,
  timeZone?: string
): string | undefined =>
  new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: timeZone ? 'short' : undefined,
  }).format(date)

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
export function getDaysInMonth(year: number, month: number): Date[] {
  const date = new Date(year, month, 1)
  const days = []
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

/**
 * Determines whether two dates are the same day in the current timezone.
 */
export function isSameDay(a: Date, b: Date): boolean {
  return formatLongDate(a) === formatLongDate(b)
}

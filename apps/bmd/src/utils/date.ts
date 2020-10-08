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

export const formatTimeZoneName = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZoneName: 'long',
    timeZone,
  })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value

export const formatFullDateTimeZone = (date: Date, timeZone?: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: 'short',
    timeZone,
  }).format(date)

export const formatShortWeekdayLongDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

export const formatShortTime = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: 'numeric',
  }).format(date)

export const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)

// TODO: replace `dateLong` with `formatLongDate`
export const dateLong = (dateString: string) =>
  moment(new Date(dateString)).format('LL')

/**
 * Get days in given month and year.
 *
 * @param year
 * @param month
 *
 * @return Date[]
 *
 */
export function getDaysInMonth(year: number, month: number) {
  const date = new Date(year, month, 1)
  const days = []
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

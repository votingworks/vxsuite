import moment from 'moment'

export const AMERICA_TIMEZONES = [
  { label: 'Hawaii-Aleutian Time', IANAZone: 'America/Honolulu' },
  { label: 'Alaska Time', IANAZone: 'America/Anchorage' },
  { label: 'Pacific Time', IANAZone: 'America/Los_Angeles' },
  { label: 'Mountain Time (Phoenix)', IANAZone: 'America/Phoenix' },
  { label: 'Mountain Time (Denver)', IANAZone: 'America/Denver' },
  { label: 'Central Time', IANAZone: 'America/Chicago' },
  { label: 'Eastern Time', IANAZone: 'America/New_York' },
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

// eslint-disable-next-line import/prefer-default-export
export const dateLong = (dateString: string) =>
  moment(new Date(dateString)).format('LL')

export const shortWeekdayAndDate = (dateString: string) =>
  moment(new Date(dateString)).format('ddd, MMMM D, YYYY')

export const twelveHourTime = (dateString: string) =>
  moment(new Date(dateString)).format('LT')

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

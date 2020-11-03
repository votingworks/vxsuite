export const formatFullDateTimeZone = (date: Date, timeZone?: string): string =>
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

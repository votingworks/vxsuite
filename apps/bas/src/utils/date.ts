/* eslint-disable import/prefer-default-export */
export const formatFullDateTimeZone = (date: Date, timeZone?: string) =>
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

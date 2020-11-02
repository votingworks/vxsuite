import { DEFAULT_LOCALE } from '../config/globals'

export const localeLongDateAndTime = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZoneName: 'short',
})

export const localeWeedkayAndDate = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

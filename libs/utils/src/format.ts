const countFormatter = new Intl.NumberFormat(undefined, { useGrouping: true });

/**
 * Format integers for display as whole numbers, i.e. a count of something.
 */
export function count(value: number): string {
  return countFormatter.format(value);
}

export const DEFAULT_LOCALE = 'en-US';

export function localeLongDateAndTime(time?: number | Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZoneName: 'short',
  }).format(time);
}

export function localeWeekdayAndDate(time?: number | Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(time);
}

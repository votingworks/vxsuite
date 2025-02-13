import { assertDefined } from '@votingworks/basics';

export const DEFAULT_LOCALE: string = 'en';

/**
 * Format integers for display as whole numbers, i.e. a count of something.
 */
export function count(value: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, { useGrouping: true }).format(value);
}

/**
 * Formats a number as a percentage.
 *
 * @example
 *   percent(0.591)                               // '59%'
 *   percent(0.591, { maximumFractionDigits: 1 }) // '59.1%'
 */
export function percent(
  value: number,
  { maximumFractionDigits = 0 } = {}
): string {
  const percentFormatter = new Intl.NumberFormat(undefined, {
    useGrouping: true,
    style: 'percent',
    maximumFractionDigits,
  });
  return percentFormatter.format(value);
}

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

export function localeLongDate(
  time?: number | Date,
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(time);
}

export function localeNumericDateAndTime(
  time?: number | Date,
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).format(time);
}

export function localeTime(time?: number | Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    hour: 'numeric',
    minute: 'numeric',
  }).format(time);
}

export function localeDate(time?: number | Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(time);
}

export function clockDateAndTime(time?: number | Date): string {
  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(time);
}

export function languageDisplayName(params: {
  languageCode: string;

  /** @default {@link params.languageCode} */
  displayLanguageCode?: string;

  /** @default 'narrow' */
  style?: Intl.RelativeTimeFormatStyle;
}): string {
  const {
    languageCode,
    displayLanguageCode = languageCode,
    style = 'narrow',
  } = params;

  return assertDefined(
    // TODO(kofi): This util doesn't currently have a comprehensive list of
    // native language names for all languages, so probably better to find a
    // reliably sourced list and hardcode the mappings instead.
    // This at least works for the top 10 spoken in the US and is sufficient for
    // cert.
    new Intl.DisplayNames([displayLanguageCode], {
      style,
      type: 'language',
      fallback: 'none',
    }).of(languageCode),
    `unexpected missing language display name for ${languageCode} in ${displayLanguageCode}`
  );
}

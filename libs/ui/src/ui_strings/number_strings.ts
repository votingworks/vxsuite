import { UiStringTranslations } from '@votingworks/types';

/**
 * The maximum number for which we generate audio.
 * Increase as needed, but keep as low as possible to minimize audio file bloat.
 *
 * Current maximum needed is the maximum number of contests supported in our
 * BMDs.
 */
export const MAXIMUM_SUPPORTED_NUMBER_FOR_TTS = 135;
export const NUMBER_STRINGS_BASE_I18N_KEY = 'number';

export function getI18nKeyForNumber(value: number): string {
  return `${NUMBER_STRINGS_BASE_I18N_KEY}${value}`;
}

/**
 * Generates a partial {@link UiStringTranslations} string catalog for a limited
 * set of numbers for which we need to generate audio (numbers from 0 to
 * {@link MAXIMUM_SUPPORTED_NUMBER_FOR_TTS}).
 */
export function generateNumberStringsCatalog(): UiStringTranslations {
  const catalog: UiStringTranslations = {};

  for (let i = 0; i <= MAXIMUM_SUPPORTED_NUMBER_FOR_TTS; i += 1) {
    const i18nKey = getI18nKeyForNumber(i);
    catalog[i18nKey] = i.toString();
  }

  return catalog;
}

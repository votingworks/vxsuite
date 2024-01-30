import { Dictionary, UiStringTranslations } from '@votingworks/types';

/**
 * The maximum number for which we generate audio.
 * Increase as needed, but keep as low as possible to minimize audio file bloat.
 *
 * Current maximum needed is the "number of seconds remaining" readout on
 * the BMD idle screen.
 */
export const MAXIMUM_SUPPORTED_NUMBER_FOR_TTS = 45;
export const NUMBER_STRINGS_BASE_I18N_KEY = 'number';

/**
 * Generates a partial {@link UiStringTranslations} string catalog for a limited
 * set of numbers for which we need to generate audio (numbers from 0 to
 * {@link MAXIMUM_SUPPORTED_NUMBER_FOR_TTS}).
 */
export function generateNumberStringsCatalog(): UiStringTranslations {
  const numberStrings: Dictionary<string> = {};

  for (let i = 0; i <= MAXIMUM_SUPPORTED_NUMBER_FOR_TTS; i += 1) {
    const numberString = i.toString();
    const i18nSubKey = numberString;
    numberStrings[i18nSubKey] = numberString;
  }

  return { [NUMBER_STRINGS_BASE_I18N_KEY]: numberStrings };
}

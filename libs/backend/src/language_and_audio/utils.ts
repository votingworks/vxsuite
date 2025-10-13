import { sha256 } from 'js-sha256';
import { assert, assertDefined } from '@votingworks/basics';
import {
  UiStringAudioIdsPackage,
  UiStringsPackage,
  LanguageCode,
  isLanguageCode,
} from '@votingworks/types';

/**
 * i18next catalog strings can contain tags that interfere with speech synthesis, e.g.
 * "Do you prefer <1>apple pie</1> or <3>orange marmalade</3>?". This function cleans text in
 * preparation for speech synthesis accordingly.
 */
export function cleanText(text: string): string {
  return text.replace(/<\/?\d+>/g, '');
}

/**
 * Generates an audio ID for the given text/language code pair.
 */
export function audioIdForText(
  languageCode: LanguageCode,
  text: string
): string {
  return sha256([languageCode, text].join(':')).slice(0, 10);
}

/**
 * Prepares text for speech synthesis by cleaning it and generating an audio ID.
 */
export function prepareTextForSpeechSynthesis(
  languageCode: LanguageCode,
  text: string
): { audioId: string; text: string } {
  const sanitizedText = cleanText(text);

  return {
    audioId: audioIdForText(languageCode, sanitizedText),
    text: sanitizedText,
  };
}

/**
 * Sets a UI string in a UI strings package
 */
export function setUiString(
  uiStrings: UiStringsPackage,
  languageCode: LanguageCode,
  stringKey: string | [string, string],
  stringInLanguage: string
): void {
  uiStrings[languageCode] ??= {}; // eslint-disable-line no-param-reassign
  const uiStringsInLanguage = assertDefined(uiStrings[languageCode]);

  // Single-value key
  if (typeof stringKey === 'string') {
    uiStringsInLanguage[stringKey] = stringInLanguage;
    return;
  }

  // Two-value key
  uiStringsInLanguage[stringKey[0]] ??= {};
  const subStructure = uiStringsInLanguage[stringKey[0]];
  assert(subStructure !== undefined && typeof subStructure === 'object');
  subStructure[stringKey[1]] = stringInLanguage;
}

/**
 * Sets audio IDs for a UI string in a UI string audio IDs package
 */
export function setUiStringAudioIds(
  uiStringAudioIds: UiStringAudioIdsPackage,
  languageCode: LanguageCode,
  stringKey: string | [string, string],
  audioIds: string[]
): void {
  uiStringAudioIds[languageCode] ??= {}; // eslint-disable-line no-param-reassign
  const uiStringAudioIdsInLanguage = assertDefined(
    uiStringAudioIds[languageCode]
  );

  // Single-value key
  if (typeof stringKey === 'string') {
    uiStringAudioIdsInLanguage[stringKey] = audioIds;
    return;
  }

  // Two-value key
  uiStringAudioIdsInLanguage[stringKey[0]] ??= {};
  const subStructure = uiStringAudioIdsInLanguage[stringKey[0]];
  assert(subStructure !== undefined && !Array.isArray(subStructure));
  subStructure[stringKey[1]] = audioIds;
}

/**
 * Helper function to iterate over all UI strings in a UI strings package
 */
export function forEachUiString(
  uiStrings: UiStringsPackage,
  fn: (entry: {
    languageCode: LanguageCode;
    stringKey: string | [string, string];
    stringInLanguage: string;
  }) => void
): void {
  for (const [languageCode, uiStringsInLanguage] of Object.entries(uiStrings)) {
    assert(isLanguageCode(languageCode));
    for (const [stringKey, value] of Object.entries(uiStringsInLanguage)) {
      assert(value !== undefined);
      if (typeof value === 'string') {
        fn({
          languageCode,
          stringKey,
          stringInLanguage: value,
        });
      } else {
        for (const [stringSubKey, stringInLanguage] of Object.entries(value)) {
          assert(stringInLanguage !== undefined);
          fn({
            languageCode,
            stringKey: [stringKey, stringSubKey],
            stringInLanguage,
          });
        }
      }
    }
  }
}

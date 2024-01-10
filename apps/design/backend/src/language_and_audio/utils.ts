import { assert, assertDefined } from '@votingworks/basics';
import { LanguageCode, UiStringsPackage } from '@votingworks/types';

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

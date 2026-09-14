import { expect, test } from 'vitest';
import { assertDefined, iter } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';
import {
  parseVendoredTranslations,
  VendoredTranslations,
} from './vendored_translations';

function eachTranslation(
  vendoredTranslations: VendoredTranslations
): Array<
  readonly [languageCode: string, englishText: string, translation: string]
> {
  return iter(Object.entries(vendoredTranslations))
    .flatMap(([languageCode, translations]) =>
      Object.entries(translations ?? {}).map(
        ([englishText, translation]) =>
          [languageCode, englishText, translation] as const
      )
    )
    .toArray();
}

function nonEmptyLanguages(
  vendoredTranslations: VendoredTranslations
): Array<[languageCode: string, keys: Set<string>]> {
  return Object.entries(vendoredTranslations)
    .map(([languageCode, translations]): [string, Set<string>] => [
      languageCode,
      new Set(Object.keys(translations ?? {})),
    ])
    .filter(([, keys]) => keys.size > 0);
}

/**
 * Spanish is the reference key set: it is the oldest vendored language and the
 * one every other language was originally translated alongside. A language may
 * vendor additional strings (newer app strings that the reference set predates),
 * but it may not be missing any of the reference strings, so that no language
 * silently falls back to the cloud translation for a string the others vendor.
 */
test('every language covers the reference (Spanish) key set', () => {
  const vendoredTranslations = parseVendoredTranslations();
  const referenceKeys = new Set(
    Object.keys(assertDefined(vendoredTranslations[LanguageCode.SPANISH]))
  );
  expect(referenceKeys.size).toBeGreaterThan(0);

  for (const [languageCode, keys] of nonEmptyLanguages(vendoredTranslations)) {
    const missing = [...referenceKeys].filter((key) => !keys.has(key));
    expect(missing, `${languageCode} is missing reference keys`).toEqual([]);
  }
});

test('no translation is empty', () => {
  for (const [languageCode, englishText, translation] of eachTranslation(
    parseVendoredTranslations()
  )) {
    expect(translation.trim(), `${languageCode}: ${englishText}`).not.toEqual(
      ''
    );
  }
});

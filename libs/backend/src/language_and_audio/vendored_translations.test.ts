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

  const languagesMissingReferenceKeys = nonEmptyLanguages(vendoredTranslations)
    .map(([languageCode, keys]) => ({
      languageCode,
      missing: [...referenceKeys].filter((key) => !keys.has(key)),
    }))
    .filter(({ missing }) => missing.length > 0);
  expect(languagesMissingReferenceKeys).toEqual([]);
});

test('no translation is empty', () => {
  const emptyTranslations = eachTranslation(parseVendoredTranslations())
    .filter(([, , translation]) => translation.trim() === '')
    .map(([languageCode, englishText]) => `${languageCode}: ${englishText}`);
  expect(emptyTranslations).toEqual([]);
});

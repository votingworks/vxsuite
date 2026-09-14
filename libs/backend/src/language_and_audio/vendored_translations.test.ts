import { expect, test } from 'vitest';
import { iter } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';
import {
  parseVendoredTranslations,
  VendoredTranslations,
} from './vendored_translations.js';

/**
 * Interpolation tags (`<1>`, `</1>`) are consumed by the `Trans` component. A
 * translation that drops or reorders them renders incorrectly.
 */
function interpolationTags(text: string): string[] {
  return text.match(/<\/?\d+>/g) ?? [];
}

/**
 * Counts sentence-ending punctuation, treating an ellipsis as a single mark and
 * accepting both Latin and CJK terminators. Used to detect translations that
 * silently drop trailing sentences.
 */
function sentenceCount(text: string): number {
  return (text.replace(/\.{2,}/g, '…').match(/[.!?。！？…]/g) ?? []).length;
}

function eachTranslation(
  vendoredTranslations: VendoredTranslations
): Array<
  readonly [languageCode: string, englishText: string, translation: string]
> {
  return iter(Object.entries(vendoredTranslations))
    .flatMap(([languageCode, translations]) =>
      Object.entries(translations).map(
        ([englishText, translation]) =>
          [languageCode, englishText, translation] as const
      )
    )
    .toArray();
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
    Object.keys(vendoredTranslations[LanguageCode.SPANISH])
  );
  expect(referenceKeys.size).toBeGreaterThan(0);

  for (const [languageCode, translations] of Object.entries(
    vendoredTranslations
  )) {
    const keys = new Set(Object.keys(translations));
    // Ignore languages that don't have vendored translations yet.
    if (keys.size === 0) continue;
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

test('interpolation tags match the English source', () => {
  for (const [languageCode, englishText, translation] of eachTranslation(
    parseVendoredTranslations()
  )) {
    expect(
      interpolationTags(translation),
      `${languageCode}: ${englishText}`
    ).toEqual(interpolationTags(englishText));
  }
});

test('translations do not drop trailing sentences', () => {
  for (const [languageCode, englishText, translation] of eachTranslation(
    parseVendoredTranslations()
  )) {
    expect(
      sentenceCount(translation),
      `${languageCode}: ${englishText}`
    ).toBeGreaterThanOrEqual(sentenceCount(englishText));
  }
});

test('translations have no leading numbering artifacts', () => {
  for (const [languageCode, englishText, translation] of eachTranslation(
    parseVendoredTranslations()
  )) {
    // A leading number is legitimate when it also appears in the English (list
    // numbering, percentages, dates that lead with the day). One that appears
    // from nowhere is an artifact.
    const leadingNumber = translation.match(/^\s*(\d+)/)?.[1];
    if (leadingNumber !== undefined) {
      expect(
        englishText.includes(leadingNumber),
        `${languageCode}: ${englishText}`
      ).toEqual(true);
    }
  }
});

test('translations have no doubled sentence-ending punctuation', () => {
  for (const [languageCode, englishText, translation] of eachTranslation(
    parseVendoredTranslations()
  )) {
    expect(
      /[。！？]{2,}/.test(translation),
      `${languageCode}: ${englishText}`
    ).toEqual(false);
  }
});

import { expect, test } from 'vitest';
import { assertDefined, iter } from '@votingworks/basics';
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

function areSetsEqual<T>(set1: Set<T>, set2: Set<T>): boolean {
  if (set1.size !== set2.size) {
    return false;
  }

  for (const item of set1) {
    if (!set2.has(item)) {
      return false;
    }
  }

  return true;
}

test('vendored_translations.json', () => {
  const vendoredTranslations = parseVendoredTranslations();
  const keySetsForEachLanguage: Array<Set<string>> = Object.values(
    vendoredTranslations
  )
    .map(Object.keys)
    .map((keys) => new Set(keys))
    // Ignore languages that don't have vendored translations yet.
    .filter((keySet) => keySet.size > 0);
  const firstKeySet = keySetsForEachLanguage[0];
  for (const keySet of keySetsForEachLanguage) {
    expect(areSetsEqual(assertDefined(firstKeySet), keySet)).toEqual(true);
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

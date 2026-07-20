import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import { parseVendoredTranslations } from './vendored_translations';

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
  const keySetsForEachLanguage: Array<Set<string>> = [];

  for (const translations of Object.values(vendoredTranslations)) {
    if (!translations || Object.keys(translations).length === 0) continue;
    keySetsForEachLanguage.push(new Set(Object.keys(translations)));
  }

  const firstKeySet = keySetsForEachLanguage[0];
  for (const keySet of keySetsForEachLanguage) {
    expect(areSetsEqual(assertDefined(firstKeySet), keySet)).toEqual(true);
  }
});

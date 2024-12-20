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
  const keySetsForEachLanguage: Array<Set<string>> = Object.values(
    vendoredTranslations
  )
    .map(Object.keys)
    .map((keys) => new Set(keys));
  const firstKeySet = keySetsForEachLanguage[0];
  for (const keySet of keySetsForEachLanguage) {
    expect(areSetsEqual(assertDefined(firstKeySet), keySet)).toEqual(true);
  }
});

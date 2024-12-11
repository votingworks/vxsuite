import makeDebug from 'debug';
import {
  GoogleCloudTranslator,
  MinimalGoogleCloudTranslationClient,
  parseVendoredTranslations,
  VendoredTranslations,
} from '@votingworks/backend';
import {
  Dictionary,
  ElectionPackage,
  LanguageCode,
  mergeUiStrings,
  NonEnglishLanguageCode,
  UiStringsPackage,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';

const debug = makeDebug('translation');

type TranslationSource =
  | 'Vendored translations'
  | 'Cached translations'
  | 'New cloud translations';

interface TranslationsCache {
  [code: string]: { [englishText: string]: string };
}

function createStringCache(uiStrings: UiStringsPackage): TranslationsCache {
  const stringCache: TranslationsCache = {};
  const englishStrings = uiStrings[LanguageCode.ENGLISH];
  assert(englishStrings);
  for (const [languageCode, translations] of Object.entries(uiStrings)) {
    const languageCache: Record<string, string> = {};
    if (languageCode === LanguageCode.ENGLISH) {
      continue;
    }
    for (const [key, value] of Object.entries(translations)) {
      if (typeof value === 'string') {
        const englishText = englishStrings[key];
        if (typeof englishText === 'string') {
          languageCache[englishText] = value;
        }
      } else {
        for (const [subKey, subValue] of Object.entries(
          value as Dictionary<string>
        )) {
          const englishText = englishStrings[key];
          if (!englishText || typeof englishText === 'string') {
            continue;
          }
          const subEnglishText = englishText[subKey];
          if (subEnglishText && subValue) {
            languageCache[subEnglishText] = subValue;
          }
        }
      }
    }
    stringCache[languageCode] = languageCache;
  }
  return stringCache;
}

/**
 * An implementation of {@link GoogleCloudTranslator} that uses the Google Cloud Translation API
 */
export class GoogleCloudTranslatorWithElectionCache extends GoogleCloudTranslator {
  private readonly vendoredTranslations: VendoredTranslations;
  private readonly stringCache: UiStringsPackage = {};

  constructor(input: {
    // Support providing a mock client for tests
    translationClient?: MinimalGoogleCloudTranslationClient;
    // Support providing custom overrides for tests
    vendoredTranslations?: VendoredTranslations;
    priorElectionPackage?: ElectionPackage;
  }) {
    super({ translationClient: input.translationClient });
    this.vendoredTranslations =
      input.vendoredTranslations ??
      /* istanbul ignore next */ parseVendoredTranslations();
    this.stringCache = input.priorElectionPackage
      ? createStringCache(
          mergeUiStrings(
            input.priorElectionPackage.uiStrings ?? {},
            input.priorElectionPackage.electionDefinition.election.ballotStrings
          )
        )
      : {};
  }

  /**
   * Translates text using the following order of precedence:
   * - Vendored translations
   * - Cached translations from the previous election package
   * - New cloud translations
   */
  async translateText(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]> {
    const translatedTextArray: string[] = Array.from<string>({
      length: textArray.length,
    }).fill('');

    const counts: Record<TranslationSource, number> = {
      'Vendored translations': 0,
      'Cached translations': 0,
      'New cloud translations': 0,
    };
    const cacheMisses: Array<{ index: number; text: string }> = [];
    for (const [index, text] of textArray.entries()) {
      const vendoredTranslation =
        this.vendoredTranslations[targetLanguageCode][text];
      if (vendoredTranslation) {
        translatedTextArray[index] = vendoredTranslation;
        counts['Vendored translations'] += 1;
        continue;
      }

      if (this.stringCache[targetLanguageCode]) {
        const cachedTranslation = this.stringCache[targetLanguageCode][text];
        if (cachedTranslation && typeof cachedTranslation === 'string') {
          translatedTextArray[index] = cachedTranslation;
          counts['Cached translations'] += 1;
          continue;
        }
      }

      cacheMisses.push({ index, text });
      counts['New cloud translations'] += 1;
    }

    for (const source of Object.keys(counts) as TranslationSource[]) {
      debug(`🌎 ${source}: ${counts[source]}`);
    }

    if (cacheMisses.length === 0) {
      return translatedTextArray;
    }

    const cacheMissesTranslated = await this.translateTextWithGoogleCloud(
      cacheMisses.map(({ text }) => text),
      targetLanguageCode
    );
    for (const [i, translatedText] of cacheMissesTranslated.entries()) {
      const { index: originalIndex } = assertDefined(cacheMisses[i]);
      translatedTextArray[originalIndex] = translatedText;
    }

    return translatedTextArray;
  }
}

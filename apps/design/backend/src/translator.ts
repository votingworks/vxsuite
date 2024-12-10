import {
  GoogleCloudTranslator,
  MinimalGoogleCloudTranslationClient,
  parseVendoredTranslations,
  VendoredTranslations,
} from '@votingworks/backend';
import { NonEnglishLanguageCode } from '@votingworks/types';
import { Store } from './store';
import { TranslationSourceCounts } from './translation_source_counts';

/**
 * An implementation of {@link GoogleCloudTranslator} that uses the Google Cloud Translation API
 */
export class GoogleCloudTranslatorWithDbCache extends GoogleCloudTranslator {
  private readonly store: Store;
  private readonly vendoredTranslations: VendoredTranslations;

  constructor(input: {
    store: Store;
    // Support providing a mock client for tests
    translationClient?: MinimalGoogleCloudTranslationClient;
    // Support providing custom overrides for tests
    vendoredTranslations?: VendoredTranslations;
  }) {
    super({ translationClient: input.translationClient });
    this.store = input.store;
    this.vendoredTranslations =
      input.vendoredTranslations ??
      /* istanbul ignore next */ parseVendoredTranslations();
  }

  /**
   * Translates text using the following order of precedence:
   * - Customer-provided translations (not yet implemented)
   * - Vendored translations
   * - Cached cloud translations
   * - New cloud translations
   */
  async translateText(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]> {
    const translatedTextArray: string[] = Array.from<string>({
      length: textArray.length,
    }).fill('');

    const counts = new TranslationSourceCounts();
    const cacheMisses: Array<{ index: number; text: string }> = [];
    for (const [index, text] of textArray.entries()) {
      const vendoredTranslation =
        this.vendoredTranslations[targetLanguageCode][text];
      if (vendoredTranslation) {
        translatedTextArray[index] = vendoredTranslation;
        counts.increment('Vendored translations');
        continue;
      }

      const translatedTextFromCache = this.store.getTranslatedTextFromCache(
        text,
        targetLanguageCode
      );
      if (translatedTextFromCache) {
        translatedTextArray[index] = translatedTextFromCache;
        counts.increment('Cached cloud translations');
        continue;
      }

      cacheMisses.push({ index, text });
      counts.increment('New cloud translations');
    }

    counts.debug();

    if (cacheMisses.length === 0) {
      return translatedTextArray;
    }

    const cacheMissesTranslated = await this.translateTextWithGoogleCloud(
      cacheMisses.map(({ text }) => text),
      targetLanguageCode
    );
    for (const [i, translatedText] of cacheMissesTranslated.entries()) {
      const { index: originalIndex, text } = cacheMisses[i];
      translatedTextArray[originalIndex] = translatedText;
      this.store.addTranslationCacheEntry({
        text,
        targetLanguageCode,
        translatedText,
      });
    }

    return translatedTextArray;
  }
}

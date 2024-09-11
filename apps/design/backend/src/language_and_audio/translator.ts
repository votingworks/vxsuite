import { TranslationServiceClient as GoogleCloudTranslationClient } from '@google-cloud/translate';
import { assertDefined, iter } from '@votingworks/basics';
import { LanguageCode, NonEnglishLanguageCode } from '@votingworks/types';

import { Store } from '../store';
import { GOOGLE_CLOUD_PROJECT_ID } from './google_cloud_config';
import { TranslationSourceCounts } from './translation_source_counts';
import {
  parseVendoredTranslations,
  VendoredTranslations,
} from './vendored_translations';

export interface Translator {
  translateText(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]>;
}

/**
 * The subset of {@link GoogleCloudTranslationClient} that we actually use
 */
export type MinimalGoogleCloudTranslationClient = Pick<
  GoogleCloudTranslationClient,
  'translateText'
>;

/**
 * An implementation of {@link Translator} that uses the Google Cloud Translation API
 */
export class GoogleCloudTranslator implements Translator {
  private readonly store: Store;
  private readonly translationClient: MinimalGoogleCloudTranslationClient;
  private readonly vendoredTranslations: VendoredTranslations;

  constructor(input: {
    store: Store;
    // Support providing a mock client for tests
    translationClient?: MinimalGoogleCloudTranslationClient;
    // Support providing custom overrides for tests
    vendoredTranslations?: VendoredTranslations;
  }) {
    this.store = input.store;
    this.translationClient =
      input.translationClient ??
      /* istanbul ignore next */ new GoogleCloudTranslationClient();
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

  private async translateTextWithGoogleCloud(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]> {
    // Google Cloud will preserve HTML tags fairly well, so we can pass HTML
    // rich text directly to the API. However, it has a max string length limit,
    // so base64 encoded img src attributes are generally too long to include.
    // We strip them out in order and replace them after translating.
    const srcRegex = /src="([^"]*)"/g;
    const srcAttrsArray = textArray.map((text) =>
      iter(text.matchAll(srcRegex))
        .map((match) => match[0])
        .toArray()
    );

    function srcPlaceholder(index: number) {
      return `src="${index}"`;
    }
    const textArrayWithoutSrcAttrs = iter(textArray)
      .zip(srcAttrsArray)
      .map(([textString, srcAttrs]) =>
        srcAttrs.reduce(
          (text, src, i) => text.replace(src, srcPlaceholder(i)),
          textString
        )
      )
      .toArray();

    const [response] = await this.translationClient.translateText({
      contents: textArrayWithoutSrcAttrs,
      mimeType: 'text/plain',
      parent: `projects/${GOOGLE_CLOUD_PROJECT_ID}`,
      sourceLanguageCode: LanguageCode.ENGLISH,
      targetLanguageCode,
    });

    const translatedTextArrayWithSrcAttrs = iter(response.translations)
      .zip(srcAttrsArray)
      .map(([{ translatedText }, srcAttrs]) =>
        srcAttrs.reduce(
          (text, src, i) => text.replace(srcPlaceholder(i), src),
          assertDefined(translatedText)
        )
      )
      .toArray();

    return translatedTextArrayWithSrcAttrs;
  }
}

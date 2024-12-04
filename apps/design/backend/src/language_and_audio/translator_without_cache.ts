import { TranslationServiceClient as GoogleCloudTranslationClient } from '@google-cloud/translate';
import { iter, assertDefined } from '@votingworks/basics';
import {
  Dictionary,
  ElectionPackage,
  mergeUiStrings,
  UiStringsPackage,
} from '@votingworks/types';
import { NonEnglishLanguageCode, LanguageCode } from '../language_code';
import { GOOGLE_CLOUD_PROJECT_ID } from './google_cloud_config';
import { TranslationSourceCounts } from './translation_source_counts';
import { Translator, MinimalGoogleCloudTranslationClient } from './translator';
import {
  VendoredTranslations,
  parseVendoredTranslations,
} from './vendored_translations';

export interface TranslationsCache {
  [code: string]: { [englishText: string]: string };
}

function createStringCache(uiStrings: UiStringsPackage): TranslationsCache {
  const stringCache: TranslationsCache = {};
  const englishStrings = uiStrings[LanguageCode.ENGLISH];
  assertDefined(englishStrings);
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

export class GoogleCloudTranslatorWithoutCache implements Translator {
  private readonly translationClient: MinimalGoogleCloudTranslationClient;
  private readonly vendoredTranslations: VendoredTranslations;
  private readonly stringCache: UiStringsPackage = {};

  constructor(input: {
    // Support providing a mock client for tests
    translationClient?: MinimalGoogleCloudTranslationClient;
    // Support providing custom overrides for tests
    vendoredTranslations?: VendoredTranslations;
    priorElectionPackage?: ElectionPackage;
  }) {
    this.translationClient =
      input.translationClient ??
      /* istanbul ignore next */ new GoogleCloudTranslationClient();
    this.vendoredTranslations =
      input.vendoredTranslations ??
      /* istanbul ignore next */ parseVendoredTranslations();
    // TODO CARO - add in everything else to pass through like the ballot strings?
    if (input.priorElectionPackage) {
      this.stringCache = createStringCache(
        mergeUiStrings(
          input.priorElectionPackage.uiStrings ?? {},
          input.priorElectionPackage.electionDefinition.election.ballotStrings
        )
      );
    } else {
      this.stringCache = {};
    }
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

      if (this.stringCache[targetLanguageCode]) {
        const cachedTranslation = this.stringCache[targetLanguageCode][text];
        if (cachedTranslation && typeof cachedTranslation === 'string') {
          translatedTextArray[index] = cachedTranslation;
          counts.increment('Cached election package translations');
          continue;
        }
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
      const { index: originalIndex } = cacheMisses[i];
      translatedTextArray[originalIndex] = translatedText;
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

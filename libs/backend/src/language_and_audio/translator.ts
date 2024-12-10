import { TranslationServiceClient as GoogleCloudTranslationClient } from '@google-cloud/translate';
import { assertDefined, iter } from '@votingworks/basics';

import { NonEnglishLanguageCode, LanguageCode } from '@votingworks/types';
import { GOOGLE_CLOUD_PROJECT_ID } from './google_cloud_config';

/**
 * The subset of {@link GoogleCloudTranslationClient} that we actually use
 */
export type MinimalGoogleCloudTranslationClient = Pick<
  GoogleCloudTranslationClient,
  'translateText'
>;

/**
 * Interface for a translator that can translate text to a specified language.
 */
export interface Translator {
  translateText(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]>;
}

/**
 * A simple base class that provides a utility function to translate text with google cloud.
 * When used directly this translator implementation will not cache translations.
 * Caching or other app-specific needs should be handled in a specific sub-class implementation.
 */
export class GoogleCloudTranslator implements Translator {
  private readonly translationClient: MinimalGoogleCloudTranslationClient;

  constructor(input: {
    // Support providing a mock client for tests
    translationClient?: MinimalGoogleCloudTranslationClient;
  }) {
    this.translationClient =
      input.translationClient ??
      /* istanbul ignore next */ new GoogleCloudTranslationClient();
  }

  async translateText(
    textArray: string[],
    targetLanguageCode: NonEnglishLanguageCode
  ): Promise<string[]> {
    return await this.translateTextWithGoogleCloud(
      textArray,
      targetLanguageCode
    );
  }

  protected async translateTextWithGoogleCloud(
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

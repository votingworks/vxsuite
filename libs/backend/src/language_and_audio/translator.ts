import {
  TranslationServiceClient as GoogleCloudTranslationClient,
  protos,
} from '@google-cloud/translate';
import { assertDefined, iter } from '@votingworks/basics';

import { NonEnglishLanguageCode, LanguageCode } from '@votingworks/types';
import { GOOGLE_CLOUD_PROJECT_ID } from './google_cloud_config';

const REGEX_IMAGE_ELEMENTS = /(<svg.*?>(.|\n)*?<\/svg>|<img (.|\n)*?>)/gi;

/**
 * Strips images from rich text. Images are replaced with placeholders that can be restored later.
 */
export function stripImagesFromRichText(text: string): string {
  let placeholderIndex = 0;
  return text.replace(REGEX_IMAGE_ELEMENTS, () => {
    const id = placeholderIndex;
    placeholderIndex += 1;
    return `<ph id="${id}" />`;
  });
}

/**
 * Restores images from the original text into a translated text that has placeholders.
 * This is used when retrieving cached translations that were stored with placeholders.
 */
export function restoreImagesInTranslation(
  originalText: string,
  translatedTextWithPlaceholders: string
): string {
  const imageElements = iter(originalText.matchAll(REGEX_IMAGE_ELEMENTS))
    .map((match) => match[0])
    .toArray();

  function srcPlaceholder(index: number) {
    return `<ph id="${index}" />`;
  }

  return imageElements.reduce(
    (text, src, i) => text.replace(srcPlaceholder(i), src),
    translatedTextWithPlaceholders
  );
}

/**
 * The subset of {@link GoogleCloudTranslationClient} that we actually use
 */
export interface MinimalGoogleCloudTranslationClient {
  translateText(
    request: protos.google.cloud.translation.v3.ITranslateTextRequest
  ): Promise<
    [
      protos.google.cloud.translation.v3.ITranslateTextResponse,
      protos.google.cloud.translation.v3.ITranslateTextRequest | undefined,
      unknown,
    ]
  >;
}

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
      /* istanbul ignore next - @preserve */ new GoogleCloudTranslationClient();
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
    // so image elements are generally too long to include.
    // We strip them out in order and replace them after translating.
    const textArrayWithoutImages = textArray.map(stripImagesFromRichText);

    const [response] = await this.translationClient.translateText({
      contents: textArrayWithoutImages,
      mimeType: 'text/plain',
      parent: `projects/${GOOGLE_CLOUD_PROJECT_ID}`,
      sourceLanguageCode: LanguageCode.ENGLISH,
      targetLanguageCode,
    });

    const translatedTextArrayWithImages = iter(response.translations)
      .zip(textArray)
      .map(([{ translatedText }, originalText]) =>
        restoreImagesInTranslation(originalText, assertDefined(translatedText))
      )
      .toArray();

    return translatedTextArrayWithImages;
  }
}

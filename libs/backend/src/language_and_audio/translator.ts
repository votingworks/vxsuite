import { Buffer } from 'node:buffer';
import {
  TranslationServiceClient as GoogleCloudTranslationClient,
  protos,
} from '@google-cloud/translate';
import { assert, assertDefined, iter } from '@votingworks/basics';

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
      /* @coverage-exclude */ new GoogleCloudTranslationClient();
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

    const translations = [];
    for (const contents of translationBatches(textArrayWithoutImages)) {
      const [response] = await this.translationClient.translateText({
        contents,
        mimeType: 'text/plain',
        parent: `projects/${GOOGLE_CLOUD_PROJECT_ID}`,
        sourceLanguageCode: LanguageCode.ENGLISH,
        targetLanguageCode,
      });
      translations.push(...(response.translations ?? []));
    }

    assert(
      translations.length === textArray.length,
      `Expected ${textArray.length} translation(s), got ${translations.length}`
    );

    return iter(translations)
      .zip(textArray)
      .map(([{ translatedText }, originalText]) =>
        restoreImagesInTranslation(originalText, assertDefined(translatedText))
      )
      .toArray();
  }
}

/**
 * Actual limit is 30,000 unicode code points. `String.length` wouldn't be an
 * accurate measurement for that, since it counts UTF-16 code units, so this is
 * a rough estimate for code point count, with some wiggle room built in.
 *
 * https://docs.cloud.google.com/translate/quotas#content-limit
 */
const MAX_BATCH_CODE_UNITS = 30_000;

/**
 * Actual limit here is 100 KiB, but leaving some wiggle room for the request
 * metadata. Shouldn't be possible to hit this limit in practice, given the
 * code unit limit, but it's here for completeness.
 *
 * https://docs.cloud.google.com/translate/quotas#content-limit
 */
const MAX_BATCH_BYTES = 96 * 1024;

/**
 * Limit on the number of items in the `contents` array in translate requests.
 *
 * https://docs.cloud.google.com/php/docs/reference/cloud-translate/latest/V3.TranslateTextRequest
 */
const MAX_BATCH_ITEMS = 1024;

/**
 * Splits the given translation request items into batches within the limits of
 * the Google Cloud Translate API.
 */
function* translationBatches(stringsToTranslate: string[]): Iterable<string[]> {
  let batch: string[] = [];
  let nBytes = 0;
  let nCodeUnits = 0;

  for (const item of stringsToTranslate) {
    const itemCodeUnits = item.length;
    const itemBytes = Buffer.byteLength(item, 'utf8');

    if (
      nCodeUnits + itemCodeUnits > MAX_BATCH_CODE_UNITS ||
      nBytes + itemBytes > MAX_BATCH_BYTES ||
      batch.length === MAX_BATCH_ITEMS
    ) {
      yield batch;
      batch = [];
      nCodeUnits = 0;
      nBytes = 0;
    }

    batch.push(item);
    nCodeUnits += itemCodeUnits;
    nBytes += itemBytes;
  }

  if (batch.length > 0) yield batch;
}

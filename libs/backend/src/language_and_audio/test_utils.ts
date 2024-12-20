/* eslint-disable vx/gts-jsdoc */
/* istanbul ignore file - @preserve */

import type * as vitest from 'vitest';
import type { jest } from '@jest/globals';
import { assertDefined } from '@votingworks/basics';
import { MinimalGoogleCloudTextToSpeechClient } from './speech_synthesizer';
import { MinimalGoogleCloudTranslationClient } from './translator';

export function mockCloudTranslatedText(
  englishText: string,
  languageCode: string
): string {
  return `${englishText} (in ${languageCode})`;
}

const mockGoogleCloudTranslationClient: MinimalGoogleCloudTranslationClient = {
  translateText: (input) =>
    Promise.resolve([
      {
        translations: assertDefined(input.contents).map((text) => ({
          translatedText: mockCloudTranslatedText(
            text,
            assertDefined(input.targetLanguageCode)
          ),
        })),
      },
      undefined,
      undefined,
    ]),
};

export function makeMockGoogleCloudTranslationClient({
  fn,
}: {
  fn: typeof vitest.vi.fn;
}): vitest.Mocked<MinimalGoogleCloudTranslationClient>;
export function makeMockGoogleCloudTranslationClient({
  fn,
}: {
  fn: typeof jest.fn;
}): jest.Mocked<MinimalGoogleCloudTranslationClient>;
export function makeMockGoogleCloudTranslationClient({
  fn,
}: {
  fn: typeof vitest.vi.fn | typeof jest.fn;
}):
  | vitest.Mocked<MinimalGoogleCloudTranslationClient>
  | jest.Mocked<MinimalGoogleCloudTranslationClient> {
  return {
    translateText: fn(mockGoogleCloudTranslationClient.translateText),
  } as unknown as
    | vitest.Mocked<MinimalGoogleCloudTranslationClient>
    | jest.Mocked<MinimalGoogleCloudTranslationClient>;
}

export function mockCloudSynthesizedSpeech(text: string): string {
  return `${text} (audio)`;
}

export function isMockCloudSynthesizedSpeech(audioContent: string): boolean {
  return audioContent.endsWith(' (audio)');
}

const mockGoogleCloudTextToSpeechClient: MinimalGoogleCloudTextToSpeechClient =
  {
    synthesizeSpeech(input: {
      input: { text: string };
    }): Promise<[{ audioContent: string | Uint8Array }, undefined, undefined]> {
      return Promise.resolve([
        { audioContent: mockCloudSynthesizedSpeech(input.input.text) },
        undefined,
        undefined,
      ]);
    },
  };

export function makeMockGoogleCloudTextToSpeechClient({
  fn,
}: {
  fn: typeof vitest.vi.fn;
}): vitest.Mocked<MinimalGoogleCloudTextToSpeechClient>;
export function makeMockGoogleCloudTextToSpeechClient({
  fn,
}: {
  fn: typeof jest.fn;
}): jest.Mocked<MinimalGoogleCloudTextToSpeechClient>;
export function makeMockGoogleCloudTextToSpeechClient({
  fn,
}: {
  fn: typeof vitest.vi.fn | typeof jest.fn;
}):
  | vitest.Mocked<MinimalGoogleCloudTextToSpeechClient>
  | jest.Mocked<MinimalGoogleCloudTextToSpeechClient> {
  return {
    synthesizeSpeech: fn(mockGoogleCloudTextToSpeechClient.synthesizeSpeech),
  } as unknown as
    | vitest.Mocked<MinimalGoogleCloudTextToSpeechClient>
    | jest.Mocked<MinimalGoogleCloudTextToSpeechClient>;
}

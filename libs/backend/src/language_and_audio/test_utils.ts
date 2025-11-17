/* eslint-disable vx/gts-jsdoc */
/* istanbul ignore file - @preserve */

import type { Mocked, vi } from 'vitest';
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
  fn: typeof vi.fn;
}): Mocked<MinimalGoogleCloudTranslationClient> {
  return {
    translateText: fn(mockGoogleCloudTranslationClient.translateText),
  };
}

export function mockCloudSynthesizedSpeech(text: string): string {
  return `[from text] ${text} (audio)`;
}

export function mockCloudSpeechFromSsml(ssml: string): string {
  return `[from ssml] ${ssml} (audio)`;
}

export function isMockCloudSynthesizedSpeech(audioContent: string): boolean {
  return audioContent.endsWith(' (audio)');
}

const mockGoogleCloudTextToSpeechClient: MinimalGoogleCloudTextToSpeechClient =
  {
    synthesizeSpeech(input: {
      input: { text: string } | { ssml: string };
    }): Promise<[{ audioContent: string | Uint8Array }, undefined, undefined]> {
      if ('ssml' in input.input) {
        return Promise.resolve([
          {
            audioContent: new TextEncoder().encode(
              mockCloudSpeechFromSsml(input.input.ssml)
            ),
          },
          undefined,
          undefined,
        ]);
      }

      return Promise.resolve([
        {
          audioContent: new TextEncoder().encode(
            mockCloudSynthesizedSpeech(input.input.text)
          ),
        },
        undefined,
        undefined,
      ]);
    },
  };

export function makeMockGoogleCloudTextToSpeechClient({
  fn,
}: {
  fn: typeof vi.fn;
}): Mocked<MinimalGoogleCloudTextToSpeechClient> {
  return {
    synthesizeSpeech: fn(mockGoogleCloudTextToSpeechClient.synthesizeSpeech),
  };
}

/* eslint-disable vx/gts-jsdoc */
/* istanbul ignore file */

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
      const encodedContent = new TextEncoder().encode(
        mockCloudSynthesizedSpeech(input.input.text)
      );

      // Pad the backing buffer to make sure downstream consumers are only using
      // the specified Uint8Array range.
      const buffer = new ArrayBuffer(encodedContent.byteLength + 20);
      const view = new Uint8Array(buffer, 10, encodedContent.byteLength);
      view.set(encodedContent);

      return Promise.resolve([
        {
          audioContent: view,
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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { UiStringsPackage } from '@votingworks/types';
import { getFeatureFlagMock } from '@votingworks/utils';
import { makeMockGoogleCloudTextToSpeechClient } from './test_utils';
import { GoogleCloudSpeechSynthesizer } from './speech_synthesizer';
import { generateAudioIdsAndClips } from './audio';

const mockFeatureFlagger = getFeatureFlagMock();
vi.mock(
  import('@votingworks/utils'),
  async (importActual): Promise<typeof import('@votingworks/utils')> => ({
    ...(await importActual()),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  })
);

describe('extractAndTranslateElectionStrings', () => {
  beforeEach(() => {
    mockFeatureFlagger.resetFeatureFlags();
  });

  test('returns empty audio information when feature flag disabled', () => {
    const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
      fn: vi.fn,
    });
    const mockSynthesizer = new GoogleCloudSpeechSynthesizer({
      textToSpeechClient,
    });
    const appStrings: UiStringsPackage = { en: { key: 'value' } };
    const electionStrings: UiStringsPackage = { en: { key2: 'value2' } };
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      isCloudTranslationAndSpeechSynthesisEnabled: false,
      appStrings,
      electionStrings,
      speechSynthesizer: mockSynthesizer,
    });

    expect(uiStringAudioIds).toEqual({});
    expect(uiStringAudioClips.read()).toEqual(null);
  });

  test('generates audio when feature flag enabled', () =>
    new Promise<void>((done) => {
      const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
        fn: vi.fn,
      });
      const mockSynthesizer = new GoogleCloudSpeechSynthesizer({
        textToSpeechClient,
      });
      const appStrings: UiStringsPackage = { en: { key: 'value' } };
      const electionStrings: UiStringsPackage = {
        en: { 'another key': 'value2' },
      };
      const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips(
        {
          isCloudTranslationAndSpeechSynthesisEnabled: true,
          appStrings,
          electionStrings,
          speechSynthesizer: mockSynthesizer,
        }
      );
      expect(uiStringAudioIds).toMatchObject({
        en: {
          'another key': ['965cfc73a2'],
          key: ['a0ce9263b1'],
        },
      });
      const audioClipChunks: string[] = [];
      uiStringAudioClips.on('data', (chunk) => {
        audioClipChunks.push(chunk.toString());
      });
      uiStringAudioClips.on('end', () => {
        const audioClips = audioClipChunks.map((chunk) => JSON.parse(chunk));
        expect(audioClips).toMatchObject([
          {
            id: 'a0ce9263b1',
            languageCode: 'en',
            dataBase64: expect.any(String),
          },
          {
            id: '965cfc73a2',
            languageCode: 'en',
            dataBase64: expect.any(String),
          },
        ]);
        done();
      });
    }));
});

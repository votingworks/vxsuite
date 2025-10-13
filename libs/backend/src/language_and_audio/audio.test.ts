import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import { LanguageCode, UiStringsPackage } from '@votingworks/types';
import { getFeatureFlagMock } from '@votingworks/utils';
import {
  GoogleCloudSpeechSynthesizer,
  SpeechSynthesizer,
} from './speech_synthesizer';
import { generateAudioIdsAndClips } from './audio';
import { audioIdForText } from './utils';
import { makeMockGoogleCloudTextToSpeechClient } from './test_utils';

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

  test('generates audio for app and election strings', () =>
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
          appStrings,
          electionStrings,
          electionTtsEdits: [],
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

  test('overrides election strings with TTS edits', async () => {
    const mockSynthesizer: Mocked<SpeechSynthesizer> = {
      synthesizeSpeech: vi.fn((text, lang) =>
        Promise.resolve(`audio-${lang}-${text}`)
      ),
    };

    const { ENGLISH, SPANISH } = LanguageCode;

    const appStrings: UiStringsPackage = {
      [SPANISH]: { buttonYes: 'Claro' },
    };

    const electionStrings: UiStringsPackage = {
      [ENGLISH]: {
        electionTitle: 'CA Primary',
        stateName: 'CA',
        contestOption4: 'CA', // Should not result in duplicate audio clip.
      },
    };

    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      electionTtsEdits: [
        {
          languageCode: ENGLISH,
          original: 'CA Primary',
          text: 'California Primary',

          exportSource: 'text',
          phonetic: [],
        },

        // Ignored - no language match:
        {
          languageCode: 'tls',
          original: 'CA',
          text: 'Certificate Authority',

          exportSource: 'text',
          phonetic: [],
        },

        // Ignored - no app string editing supported, currently:
        {
          languageCode: SPANISH,
          original: 'Claro',
          text: 'Clahro',

          exportSource: 'text',
          phonetic: [],
        },
      ],
      speechSynthesizer: mockSynthesizer,
    });

    expect(uiStringAudioIds).toMatchObject({
      [ENGLISH]: {
        electionTitle: [audioIdForText(ENGLISH, 'CA Primary')],
        stateName: [audioIdForText(ENGLISH, 'CA')],
        contestOption4: [audioIdForText(ENGLISH, 'CA')],
      },
      [SPANISH]: {
        buttonYes: [audioIdForText(SPANISH, 'Claro')],
      },
    });

    const clips: string[] = [];
    uiStringAudioClips.on('data', (chunk) => clips.push(chunk.toString()));

    await new Promise<void>((resolve) => {
      uiStringAudioClips.on('end', () => {
        const parsedClips = clips.map((c) => JSON.parse(c));

        expect(parsedClips).toMatchObject([
          // buttonYes
          {
            id: audioIdForText(SPANISH, 'Claro'),
            languageCode: SPANISH,
            dataBase64: `audio-${SPANISH}-Claro`,
          },

          // electionTitle
          {
            id: audioIdForText(ENGLISH, 'CA Primary'),
            languageCode: ENGLISH,
            dataBase64: `audio-${ENGLISH}-California Primary`,
          },

          // stateName, contestOption4
          {
            id: audioIdForText(ENGLISH, 'CA'),
            languageCode: ENGLISH,
            dataBase64: `audio-${ENGLISH}-CA`,
          },
        ]);

        resolve();
      });
    });
  });
});

import { beforeEach, describe, expect, Mocked, test, vi } from 'vitest';
import {
  ElectionStringKey,
  LanguageCode,
  PhoneticWord,
  ssmlGenerate,
  UiStringsPackage,
} from '@votingworks/types';
import { getFeatureFlagMock } from '@votingworks/utils';
import { deferred } from '@votingworks/basics';
import {
  GoogleCloudSpeechSynthesizer,
  SpeechSynthesizer,
} from './speech_synthesizer';
import { generateAudioIdsAndClips } from './audio';
import { audioIdForText } from './utils';
import { makeMockGoogleCloudTextToSpeechClient } from './test_utils';
import { convertHtmlToAudioCues } from './rich_text';

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
      fromSsml: vi.fn((words, lang) =>
        Promise.resolve(`audio-${lang}-${ssmlGenerate(words)}`)
      ),
      fromText: vi.fn((text, lang) => Promise.resolve(`audio-${lang}-${text}`)),
    };

    const { ENGLISH, SPANISH } = LanguageCode;

    const appStrings: UiStringsPackage = {
      [SPANISH]: { buttonYes: 'Claro' },
    };

    const electionStrings: UiStringsPackage = {
      [ENGLISH]: {
        electionTitle: 'CA Primary',
        precinctName1: 'La Jolla',
        stateName: 'CA',
        contestOption4: 'CA', // Should not result in duplicate audio clip.
      },
    };

    const laJollaPhonetic: PhoneticWord[] = [
      { syllables: [{ ipaPhonemes: ['l', 'ə'] }], text: 'La' },
      {
        syllables: [{ ipaPhonemes: ['h', 'ɔː', 'iː', 'ə'], stress: 'primary' }],
        text: 'Jolla',
      },
    ];

    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      electionTtsEdits: [
        {
          languageCode: ENGLISH,
          original: 'CA Primary',
          text: '[edit] California Primary',

          exportSource: 'text',
          phonetic: [],
        },

        {
          languageCode: ENGLISH,
          original: 'La Jolla',

          exportSource: 'phonetic',
          phonetic: laJollaPhonetic,
          text: 'La Jolla',
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

    const { promise, reject, resolve } = deferred<void>();
    uiStringAudioClips.on('end', () => {
      try {
        expect(clips.map((c) => JSON.parse(c))).toMatchObject([
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
            dataBase64: `audio-${ENGLISH}-[edit] California Primary`,
          },

          // precinctName1
          {
            id: audioIdForText(ENGLISH, 'La Jolla'),
            languageCode: ENGLISH,
            dataBase64: `audio-${ENGLISH}-${ssmlGenerate(laJollaPhonetic)}`,
          },

          // stateName, contestOption4
          {
            id: audioIdForText(ENGLISH, 'CA'),
            languageCode: ENGLISH,
            dataBase64: `audio-${ENGLISH}-CA`,
          },
        ]);

        resolve();
      } catch (err) {
        reject(err);
      }
    });

    await promise;
  });

  test('matches contest description edits based on sanitized strings', async () => {
    const mockSynthesizer: Mocked<SpeechSynthesizer> = {
      fromSsml: vi.fn((words, lang) =>
        Promise.resolve(`audio-${lang}-${ssmlGenerate(words)}`)
      ),
      fromText: vi.fn((text, lang) => Promise.resolve(`audio-${lang}-${text}`)),
    };

    const { ENGLISH } = LanguageCode;

    const originalString = `
      <p>Change the state seal to this?</p>
      <img src="data:image/png;base64,AABBCC==" />
    `;
    const sanitizedString = convertHtmlToAudioCues(originalString);

    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings: {},
      electionStrings: {
        [ENGLISH]: {
          [ElectionStringKey.CONTEST_DESCRIPTION]: { abc123: originalString },
        },
      },
      electionTtsEdits: [
        {
          languageCode: ENGLISH,
          original: sanitizedString,
          text: 'edited description',

          exportSource: 'text',
          phonetic: [],
        },
      ],
      speechSynthesizer: mockSynthesizer,
    });

    expect(uiStringAudioIds).toMatchObject({
      [ENGLISH]: {
        [ElectionStringKey.CONTEST_DESCRIPTION]: {
          abc123: [audioIdForText(ENGLISH, sanitizedString)],
        },
      },
    });

    const clips: string[] = [];
    uiStringAudioClips.on('data', (chunk) => clips.push(chunk.toString()));

    const { promise, reject, resolve } = deferred<void>();
    uiStringAudioClips.on('end', () => {
      try {
        expect(clips.map((c) => JSON.parse(c))).toMatchObject([
          {
            id: audioIdForText(ENGLISH, sanitizedString),
            languageCode: ENGLISH,
            dataBase64: `audio-${ENGLISH}-edited description`,
          },
        ]);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

    await promise;
  });
});

import { UiStringsPackage } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { MockGoogleCloudTextToSpeechClient } from './test_utils';
import { GoogleCloudSpeechSynthesizer } from './speech_synthesizer';
import { generateAudioIdsAndClips } from './audio';

const mockFeatureFlagger = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

describe('extractAndTranslateElectionStrings', () => {
  beforeEach(() => {
    mockFeatureFlagger.resetFeatureFlags();
  });

  it('returns empty audio information when feature flag disabled', () => {
    mockFeatureFlagger.disableFeatureFlag(
      BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
    );
    const textToSpeechClient = new MockGoogleCloudTextToSpeechClient();
    const mockSynthesizer = new GoogleCloudSpeechSynthesizer({
      textToSpeechClient,
    });
    const appStrings: UiStringsPackage = { en: { key: 'value' } };
    const electionStrings: UiStringsPackage = { en: { key2: 'value2' } };
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      speechSynthesizer: mockSynthesizer,
    });

    expect(uiStringAudioIds).toEqual({});
    expect(uiStringAudioClips.read()).toEqual(null);
  });

  it('generates audio when feature flag enabled', (done) => {
    mockFeatureFlagger.enableFeatureFlag(
      BooleanEnvironmentVariableName.ENABLE_CLOUD_TRANSLATION_AND_SPEECH_SYNTHESIS
    );
    const textToSpeechClient = new MockGoogleCloudTextToSpeechClient();
    const mockSynthesizer = new GoogleCloudSpeechSynthesizer({
      textToSpeechClient,
    });
    const appStrings: UiStringsPackage = { en: { key: 'value' } };
    const electionStrings: UiStringsPackage = {
      en: { 'another key': 'value2' },
    };
    const { uiStringAudioIds, uiStringAudioClips } = generateAudioIdsAndClips({
      appStrings,
      electionStrings,
      speechSynthesizer: mockSynthesizer,
    });
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
  });
});

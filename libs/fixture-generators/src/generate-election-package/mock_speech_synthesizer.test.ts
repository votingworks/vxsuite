import { describe, expect, test } from 'vitest';
import { LanguageCode } from '@votingworks/types';
import { MockTextToSpeechSynthesizer } from './mock_speech_synthesizer';

describe('MockTextToSpeechSynthesizer', () => {
  test('returns empty string', async () => {
    const mockSpeechSynthesizer = new MockTextToSpeechSynthesizer();
    for (const languageCode of Object.values(LanguageCode)) {
      const result = await mockSpeechSynthesizer.synthesizeSpeech(
        '',
        languageCode
      );
      expect(result).toEqual('');
    }
  });
});

import { describe, expect, test, vi } from 'vitest';
import { LanguageCode, BallotLanguageConfigs } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { GoogleCloudTranslator } from './translator';
import { makeMockGoogleCloudTranslationClient } from './test_utils';
import { translateAppStrings } from './app_strings';

const englishOnlyConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH] },
];

const allBallotLanguages: BallotLanguageConfigs = [
  {
    languages: [
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ],
  },
];

describe('translateAppStrings', () => {
  test('should extract and translate app strings correctly', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateAppStrings(
      mockTranslator,
      'latest',
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    // This number may need to be updated if you are adding a new app string
    expect(Object.keys(englishResults)).toHaveLength(438);
  });

  test('should extract and translate app strings correctly for multiple languages', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateAppStrings(
      mockTranslator,
      'latest',
      allBallotLanguages
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    for (const languageCode of Object.keys(result)) {
      const subResults = result[languageCode];
      assert(subResults);
      // This number may need to be updated if you are adding a new app string
      expect(Object.keys(subResults)).toHaveLength(438);
    }
  });
});

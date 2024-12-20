import { LanguageCode, BallotLanguageConfigs } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { GoogleCloudTranslator } from './translator';
import { MockGoogleCloudTranslationClient } from './test_utils';
import { translateBallotStrings, translateHmpbStrings } from './ballot_strings';

const englishOnlyConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH] },
];

const allOtherBallotLanguages: BallotLanguageConfigs = [
  {
    languages: [
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ],
  },
];

describe('translateBallotStrings', () => {
  it('should extract and translate ballot strings correctly', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateBallotStrings(
      mockTranslator,
      electionPrimaryPrecinctSplitsFixtures.readElection(),
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    // There should be 44 ballot strings generated, this number may need to be updated if you are adding a new hmpb string, or updating the election used
    expect(Object.keys(englishResults)).toHaveLength(44);
  });

  it('should extract and translate ballot strings correctly for multiple languages', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateBallotStrings(
      mockTranslator,
      electionPrimaryPrecinctSplitsFixtures.readElection(),
      allOtherBallotLanguages
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    for (const languageCode of Object.keys(result)) {
      if (languageCode === LanguageCode.ENGLISH) {
        continue; // tested above
      }
      const subResults = result[languageCode];
      assert(subResults);
      // There should be 42 ballot strings generated, this number may need to be updated if you are adding a new hmpb string
      expect(Object.keys(subResults)).toHaveLength(42);
    }
  });
});

describe('translateHmpbStrings', () => {
  it('should extract and translate hmpb strings correctly', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateHmpbStrings(
      mockTranslator,
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    // There should be 30 hmpb strings generated, this number may need to be updated if you are adding a new hmpb string
    expect(Object.keys(englishResults)).toHaveLength(30);
  });

  it('should extract and translate hmpb strings correctly for multiple languages', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateHmpbStrings(
      mockTranslator,
      allOtherBallotLanguages
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
      // There should be 30 hmpb strings generated, this number may need to be updated if you are adding a new hmpb string
      expect(Object.keys(subResults)).toHaveLength(30);
    }
  });
});

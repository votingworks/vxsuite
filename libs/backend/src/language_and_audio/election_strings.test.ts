import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { LanguageCode, BallotLanguageConfigs } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator } from './translator';
import { MockGoogleCloudTranslationClient } from './test_utils';

const englishOnlyConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH] },
];
const englishSpanishLanguageConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH, LanguageCode.SPANISH] },
];

describe('extractAndTranslateElectionStrings', () => {
  it('should extract and translate election strings correctly for english only', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await extractAndTranslateElectionStrings(
      mockTranslator,
      electionPrimaryPrecinctSplitsFixtures.readElection(),
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    expect(englishResults).toMatchSnapshot();
  });

  it('should extract and translate election strings correctly for english only with election with contest term', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await extractAndTranslateElectionStrings(
      mockTranslator,
      electionTwoPartyPrimaryFixtures.readElection(),
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    expect(englishResults).toMatchSnapshot();
  });

  it('should extract and translate election strings correctly for multiple languages', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await extractAndTranslateElectionStrings(
      mockTranslator,
      electionPrimaryPrecinctSplitsFixtures.readElection(),
      englishSpanishLanguageConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.SPANISH,
    ]);
    const englishResults = result[LanguageCode.ENGLISH];
    const spanishResults = result[LanguageCode.SPANISH];
    assert(englishResults);
    assert(spanishResults);
    // Should translate all the same fields
    expect(spanishResults).toMatchSnapshot();
  });
});

import { describe, expect, test, vi } from 'vitest';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  LanguageCode,
  BallotLanguageConfigs,
  ElectionStringKey,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator } from './translator';
import { makeMockGoogleCloudTranslationClient } from './test_utils';

const englishOnlyConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH] },
];
const englishSpanishLanguageConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH, LanguageCode.SPANISH] },
];
const englishChineseLanguageConfig: BallotLanguageConfigs = [
  { languages: [LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED] },
];

describe('extractAndTranslateElectionStrings', () => {
  test('should extract and translate election strings correctly for english only', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
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

  test('should extract and translate election strings correctly for english only with election with contest term', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
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

  test('should extract and translate election strings correctly for multiple languages', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
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
    // Spanish uses a Latin script, so candidate names stay English-only
    expect(spanishResults[ElectionStringKey.CANDIDATE_NAME]).toBeUndefined();
  });

  test('should transliterate candidate names for languages with non-Latin scripts', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await extractAndTranslateElectionStrings(
      mockTranslator,
      electionPrimaryPrecinctSplitsFixtures.readElection(),
      englishChineseLanguageConfig
    );

    const englishResults = result[LanguageCode.ENGLISH];
    const chineseResults = result[LanguageCode.CHINESE_SIMPLIFIED];
    assert(englishResults);
    assert(chineseResults);

    const englishNames = englishResults[ElectionStringKey.CANDIDATE_NAME];
    const chineseNames = chineseResults[ElectionStringKey.CANDIDATE_NAME];
    assert(typeof englishNames === 'object');
    assert(typeof chineseNames === 'object');

    expect(englishNames['horse']).toEqual('Horse');
    expect(chineseNames['horse']).toEqual('Horse (in zh-Hans)');
    expect(Object.keys(chineseNames)).toEqual(Object.keys(englishNames));
  });
});

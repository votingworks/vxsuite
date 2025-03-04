import { describe, expect, test, vi } from 'vitest';
import {
  LanguageCode,
  BallotLanguageConfigs,
  generateSplittablePrecinctsForTest,
  DistrictId,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { GoogleCloudTranslator } from './translator';
import { makeMockGoogleCloudTranslationClient } from './test_utils';
import {
  getUserDefinedHmpbStrings,
  translateBallotStrings,
  translateHmpbStrings,
} from './ballot_strings';
import { mockHmpbStringsCatalog } from '../../test/fixtures/hmpb_strings_catalog';

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
  test('should extract and translate ballot strings correctly', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();
    const result = await translateBallotStrings(
      mockTranslator,
      election,
      mockHmpbStringsCatalog,
      englishOnlyConfig,
      generateSplittablePrecinctsForTest(election)
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    expect(Object.keys(englishResults)).toHaveLength(16);
  });

  test('should extract and translate ballot strings correctly for multiple languages', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const election = electionPrimaryPrecinctSplitsFixtures.readElection();
    const result = await translateBallotStrings(
      mockTranslator,
      election,
      mockHmpbStringsCatalog,
      allOtherBallotLanguages,
      generateSplittablePrecinctsForTest(election)
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
      expect(Object.keys(subResults)).toHaveLength(14);
    }
  });
});

describe('translateHmpbStrings', () => {
  test('should extract and translate hmpb strings correctly', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateHmpbStrings(
      mockTranslator,
      mockHmpbStringsCatalog,
      englishOnlyConfig
    );

    expect(result).toBeDefined();
    expect(Object.keys(result)).toEqual([LanguageCode.ENGLISH]);
    const englishResults = result[LanguageCode.ENGLISH];
    assert(englishResults);
    expect(Object.keys(englishResults)).toHaveLength(2);
  });

  test('should extract and translate hmpb strings correctly for multiple languages', async () => {
    const translationClient = makeMockGoogleCloudTranslationClient({
      fn: vi.fn,
    });
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const result = await translateHmpbStrings(
      mockTranslator,
      mockHmpbStringsCatalog,
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
      expect(Object.keys(subResults)).toHaveLength(2);
    }
  });
});

test('getUserDefinedHmpbStrings', () => {
  const districtIds: DistrictId[] = ['district-1' as DistrictId];
  const precincts = [
    {
      id: 'precinct-1',
      name: 'Precinct 1',
      splits: [
        {
          districtIds,
          id: 'split-a',
          name: 'Split A',
          clerkSignatureCaption: 'Signature',
          electionTitleOverride: 'Title',
        },
      ],
    },
    {
      id: 'precinct-2',
      name: 'Precinct 2',
      districtIds,
    },
  ];

  expect(getUserDefinedHmpbStrings(precincts)).toEqual({
    'hmpbClerkSignatureCaption_precinct-1_split-a': 'Signature',
    'hmpbElectionTitleOverride_precinct-1_split-a': 'Title',
  });
});

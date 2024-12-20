import { electionPrimaryPrecinctSplitsFixtures } from '@votingworks/fixtures';
import { LanguageCode, BallotLanguageConfigs } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { getAllStringsForElectionPackage } from './election_package_strings';
import { GoogleCloudTranslator } from './translator';
import { MockGoogleCloudTranslationClient } from './test_utils';

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

describe('getAllStringsForElectionPackage', () => {
  it('should extract and translate election strings correctly for english only', async () => {
    const translationClient = new MockGoogleCloudTranslationClient();
    const mockTranslator = new GoogleCloudTranslator({ translationClient });
    const [appStrings, hmpbStrings, electionStrings] =
      await getAllStringsForElectionPackage(
        electionPrimaryPrecinctSplitsFixtures.readElection(),
        mockTranslator,
        allBallotLanguages
      );

    expect(appStrings).toBeDefined();
    expect(Object.keys(appStrings)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    assert(appStrings[LanguageCode.ENGLISH]);
    expect(Object.keys(appStrings[LanguageCode.ENGLISH])).toHaveLength(427);

    expect(hmpbStrings).toBeDefined();
    expect(Object.keys(hmpbStrings)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    assert(hmpbStrings[LanguageCode.ENGLISH]);
    expect(Object.keys(hmpbStrings[LanguageCode.ENGLISH])).toHaveLength(30);

    expect(electionStrings).toBeDefined();
    expect(Object.keys(electionStrings)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.SPANISH,
    ]);
    assert(electionStrings[LanguageCode.ENGLISH]);
    expect(Object.keys(electionStrings[LanguageCode.ENGLISH])).toHaveLength(14);
  });
});

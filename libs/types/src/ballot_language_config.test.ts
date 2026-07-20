import { expect, test } from 'vitest';
import {
  BallotLanguageConfig,
  getAllBallotLanguages,
  getBallotLanguageConfigs,
} from './ballot_language_config';
import { LanguageCode } from './language_code';

test('isLanguageCode', () => {
  expect(getAllBallotLanguages([])).toEqual([]);
  expect(
    getAllBallotLanguages([
      { languages: [LanguageCode.ENGLISH] },
      { languages: [LanguageCode.CHINESE_SIMPLIFIED] },
    ])
  ).toEqual([LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED]);
  expect(
    getAllBallotLanguages([
      { languages: [LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED] },
      { languages: [LanguageCode.CHINESE_SIMPLIFIED] },
    ])
  ).toEqual([LanguageCode.ENGLISH, LanguageCode.CHINESE_SIMPLIFIED]);
  expect(
    getAllBallotLanguages([
      { languages: [LanguageCode.ENGLISH, LanguageCode.SPANISH] },
      { languages: [LanguageCode.CHINESE_SIMPLIFIED] },
    ])
  ).toEqual([
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
    LanguageCode.CHINESE_SIMPLIFIED,
  ]);
});

test('getBallotLanguageConfigs', () => {
  expect(getBallotLanguageConfigs([LanguageCode.ENGLISH])).toEqual([
    { languages: [LanguageCode.ENGLISH] },
  ]);

  function sortFn(
    configA: BallotLanguageConfig,
    configB: BallotLanguageConfig
  ) {
    return configA.languages[0].localeCompare(configB.languages[0]);
  }
  expect(
    getBallotLanguageConfigs([
      LanguageCode.ARABIC,
      LanguageCode.BENGALI,
      LanguageCode.CHINESE_SIMPLIFIED,
      LanguageCode.CHINESE_TRADITIONAL,
      LanguageCode.ENGLISH,
      LanguageCode.SPANISH,
    ]).sort(sortFn)
  ).toEqual(
    [
      { languages: [LanguageCode.ARABIC] },
      { languages: [LanguageCode.BENGALI] },
      { languages: [LanguageCode.CHINESE_SIMPLIFIED] },
      { languages: [LanguageCode.CHINESE_TRADITIONAL] },
      { languages: [LanguageCode.ENGLISH] },
      { languages: [LanguageCode.SPANISH] },
    ].sort(sortFn)
  );
});

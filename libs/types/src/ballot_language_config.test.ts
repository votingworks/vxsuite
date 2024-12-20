import {
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
  expect(getBallotLanguageConfigs(false)).toEqual([
    { languages: [LanguageCode.ENGLISH] },
  ]);
  expect(getBallotLanguageConfigs(true)).toEqual(
    Object.values(LanguageCode).map((l) => ({ languages: [l] }))
  );
});

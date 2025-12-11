import { expect, test } from 'vitest';
import { LanguageCode, Election } from '@votingworks/types';
import { languageSort, getLanguageOptions } from './languages';

test('languageSort', () => {
  const languages = [
    LanguageCode.CHINESE_TRADITIONAL,
    LanguageCode.SPANISH,
    LanguageCode.ENGLISH,
    LanguageCode.CHINESE_SIMPLIFIED,
  ];

  const sorted = languages.toSorted(languageSort);

  expect(sorted).toEqual([
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
    LanguageCode.CHINESE_SIMPLIFIED,
    LanguageCode.CHINESE_TRADITIONAL,
  ]);
});

test('getLanguageOptions', () => {
  const election: Pick<Election, 'ballotStyles'> = {
    ballotStyles: [
      {
        id: 'bs1',
        precincts: ['p1'],
        languages: [LanguageCode.SPANISH, LanguageCode.ENGLISH],
        groupId: 'g1',
        districts: ['d1'],
      },
      {
        id: 'bs2',
        precincts: ['p2'],
        languages: [LanguageCode.CHINESE_SIMPLIFIED, LanguageCode.ENGLISH],
        groupId: 'g2',
        districts: ['d2'],
      },
      {
        id: 'bs3',
        precincts: ['p3'],
        languages: [LanguageCode.ENGLISH],
        groupId: 'g1',
        districts: ['d1'],
      },
    ],
  };

  expect(getLanguageOptions(election as Election)).toEqual([
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
    LanguageCode.CHINESE_SIMPLIFIED,
  ]);
});

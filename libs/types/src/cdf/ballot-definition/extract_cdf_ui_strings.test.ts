import { assertDefined } from '@votingworks/basics';
import { extractCdfUiStrings } from './convert';
import * as BallotDefinition from './index';
import { testCdfBallotDefinition } from './fixtures';
import { ElectionStringKey } from '../../ui_string_translations';

function buildInternationalizedText(
  values: Record<string, string>
): BallotDefinition.InternationalizedText {
  return {
    '@type': 'BallotDefinition.InternationalizedText',
    Text: Object.entries(values).map(([languageCode, value]) => ({
      '@type': 'BallotDefinition.LanguageString',
      Content: value,
      Language: languageCode,
    })),
  };
}

const ORIGINAL_ELECTION: Readonly<BallotDefinition.Election> = assertDefined(
  testCdfBallotDefinition.Election[0]
);

/**
 * Test-per-ElectionStringKey mapping to make sure tests stay in  sync with
 * key changes.
 */
const tests: Record<ElectionStringKey, () => void> = {
  [ElectionStringKey.BALLOT_LANGUAGE]() {
    const uiStrings = extractCdfUiStrings(testCdfBallotDefinition);

    expect(uiStrings['en']?.[ElectionStringKey.BALLOT_LANGUAGE]).toEqual(
      'English'
    );
  },

  [ElectionStringKey.BALLOT_STYLE_ID]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          BallotStyle: [
            {
              ...assertDefined(ORIGINAL_ELECTION.BallotStyle[0]),
              ExternalIdentifier: [
                {
                  '@type': 'BallotDefinition.ExternalIdentifier',
                  Type: BallotDefinition.IdentifierType.StateLevel,
                  Value: 'ballot_style_1',
                },
              ],
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.BallotStyle[1]),
              ExternalIdentifier: [
                {
                  '@type': 'BallotDefinition.ExternalIdentifier',
                  Type: BallotDefinition.IdentifierType.StateLevel,
                  Value: 'ballot_style_2',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.BALLOT_STYLE_ID]: {
          ballot_style_1: 'ballot_style_1',
          ballot_style_2: 'ballot_style_2',
        },
      }),
    });
  },

  [ElectionStringKey.CANDIDATE_NAME]() {
    const originalCandidates = assertDefined(ORIGINAL_ELECTION.Candidate);

    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Candidate: [
            {
              ...assertDefined(originalCandidates[0]),
              '@id': 'candidate1',
              BallotName: buildInternationalizedText({
                en: 'Pinky and The Brain',
                'es-US': 'Pinky y Cerebro',
              }),
            },
            {
              ...assertDefined(originalCandidates[1]),
              '@id': 'candidate2',
              BallotName: buildInternationalizedText({
                en: 'Tom and Jerry',
                'es-US': 'Tom y Jerry',
              }),
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.CANDIDATE_NAME]: {
          candidate1: 'Pinky and The Brain',
          candidate2: 'Tom and Jerry',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.CANDIDATE_NAME]: {
          candidate1: 'Pinky y Cerebro',
          candidate2: 'Tom y Jerry',
        },
      }),
    });
  },

  [ElectionStringKey.CONTEST_DESCRIPTION]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Contest: [
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[0]),
              '@id': 'contest1',
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                en: 'Would you like apples or oranges?',
                'zh-Hant': '你想要蘋果還是橘子？',
              }),
              ContestOption: [],
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@id': 'contest2',
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                en: 'Would you like olives or pickles?',
                'zh-Hant': '您想要橄欖還是泡菜？',
              }),
              ContestOption: [],
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.CONTEST_DESCRIPTION]: {
          contest1: 'Would you like apples or oranges?',
          contest2: 'Would you like olives or pickles?',
        },
      }),
      'zh-Hant': expect.objectContaining({
        [ElectionStringKey.CONTEST_DESCRIPTION]: {
          contest1: '你想要蘋果還是橘子？',
          contest2: '您想要橄欖還是泡菜？',
        },
      }),
    });
  },

  [ElectionStringKey.CONTEST_OPTION_LABEL]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Contest: [
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[0]),
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                en: 'Apples or Oranges?',
              }),
              ContestOption: [
                {
                  '@id': 'appleOrOrangeOptionApple',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    en: 'Apples',
                    'es-US': 'Manzanas',
                  }),
                },
                {
                  '@id': 'appleOrOrangeOptionOrange',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    en: 'Oranges',
                    'es-US': 'Naranjas',
                  }),
                },
              ],
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                en: 'Apples or Bananas?',
              }),
              ContestOption: [
                {
                  '@id': 'appleOrBananaOptionApple',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    en: 'Apples',
                    'es-US': 'Manzanas',
                  }),
                },
                {
                  '@id': 'appleOrBananaOptionBanana',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    en: 'Bananas',
                    'es-US': 'Plátanos',
                  }),
                },
              ],
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.CONTEST_OPTION_LABEL]: {
          appleOrOrangeOptionApple: 'Apples',
          appleOrBananaOptionApple: 'Apples',
          appleOrOrangeOptionOrange: 'Oranges',
          appleOrBananaOptionBanana: 'Bananas',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.CONTEST_OPTION_LABEL]: {
          appleOrOrangeOptionApple: 'Manzanas',
          appleOrBananaOptionApple: 'Manzanas',
          appleOrOrangeOptionOrange: 'Naranjas',
          appleOrBananaOptionBanana: 'Plátanos',
        },
      }),
    });
  },

  [ElectionStringKey.CONTEST_TERM]() {
    const uiStrings = extractCdfUiStrings(testCdfBallotDefinition);

    expect(uiStrings['en']?.[ElectionStringKey.CONTEST_TERM]).toEqual({
      'contest-1': '1 year',
    });
  },

  [ElectionStringKey.CONTEST_TITLE]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Contest: [
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[0]),
              '@id': 'contest1',
              BallotTitle: buildInternationalizedText({
                en: 'President',
                'zh-Hant': '總統',
              }),
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@id': 'contest2',
              BallotTitle: buildInternationalizedText({
                en: 'Mayor',
                'zh-Hant': '市長',
              }),
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.CONTEST_TITLE]: {
          contest1: 'President',
          contest2: 'Mayor',
        },
      }),
      'zh-Hant': expect.objectContaining({
        [ElectionStringKey.CONTEST_TITLE]: {
          contest1: '總統',
          contest2: '市長',
        },
      }),
    });
  },

  [ElectionStringKey.COUNTY_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      GpUnit: [
        {
          '@id': 'kingsCounty',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'Kings County',
            'es-US': 'Condado de Kings',
          }),
          Type: BallotDefinition.ReportingUnitType.County,
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.COUNTY_NAME]: 'Kings County',
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.COUNTY_NAME]: 'Condado de Kings',
      }),
    });
  },

  [ElectionStringKey.DISTRICT_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      GpUnit: [
        {
          '@id': 'district9',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'District 9',
            'es-US': 'Distrito 9',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
        {
          '@id': 'notADistrict',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'Not A District',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
        {
          '@id': 'district10',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'District 10',
            'es-US': 'Distrito 10',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
      ],
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Contest: [
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[0]),
              ElectionDistrictId: 'district9',
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              ElectionDistrictId: 'district10',
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.DISTRICT_NAME]: {
          district9: 'District 9',
          district10: 'District 10',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.DISTRICT_NAME]: {
          district9: 'Distrito 9',
          district10: 'Distrito 10',
        },
      }),
    });
  },

  [ElectionStringKey.ELECTION_DATE]() {
    const uiStrings = extractCdfUiStrings(testCdfBallotDefinition);

    expect(uiStrings['en']?.[ElectionStringKey.ELECTION_DATE]).toEqual(
      'June 6, 2021'
    );
  },

  [ElectionStringKey.ELECTION_TITLE]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Name: buildInternationalizedText({
            en: 'General Election',
            'es-US': 'Elección General',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.ELECTION_TITLE]: 'General Election',
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.ELECTION_TITLE]: 'Elección General',
      }),
    });
  },

  [ElectionStringKey.PARTY_FULL_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Party: [
        {
          ...assertDefined(testCdfBallotDefinition.Party[0]),
          '@id': 'party1',
          Name: buildInternationalizedText({
            en: 'Block Party',
            'es-US': 'Fiesta En La Calle',
          }),
        },
        {
          ...assertDefined(testCdfBallotDefinition.Party[1]),
          '@id': 'party2',
          Name: buildInternationalizedText({
            en: 'Pool Party',
            'es-US': 'Fiesta De Piscina',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.PARTY_FULL_NAME]: {
          party1: 'Block Party',
          party2: 'Pool Party',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.PARTY_FULL_NAME]: {
          party1: 'Fiesta En La Calle',
          party2: 'Fiesta De Piscina',
        },
      }),
    });
  },

  [ElectionStringKey.PARTY_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Party: [
        {
          ...assertDefined(testCdfBallotDefinition.Party[0]),
          '@id': 'party1',
          Name: buildInternationalizedText({
            en: 'Block Party',
            'es-US': 'Fiesta En La Calle',
          }),
        },
        {
          ...assertDefined(testCdfBallotDefinition.Party[1]),
          '@id': 'party2',
          Name: buildInternationalizedText({
            en: 'Pool Party',
            'es-US': 'Fiesta De Piscina',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.PARTY_NAME]: {
          party1: 'Block Party',
          party2: 'Pool Party',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.PARTY_NAME]: {
          party1: 'Fiesta En La Calle',
          party2: 'Fiesta De Piscina',
        },
      }),
    });
  },

  [ElectionStringKey.PRECINCT_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      GpUnit: [
        {
          '@id': 'brooklyn99',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'Brooklyn Nine-Nine',
            'es-US': 'Brooklyn Nueve-Nueve',
          }),
          Type: BallotDefinition.ReportingUnitType.Precinct,
        },
        {
          '@id': 'westRiver',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'West River',
            'es-US': 'Río Oeste',
          }),
          Type: BallotDefinition.ReportingUnitType.Precinct,
        },
        {
          '@id': 'district9',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'District9',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.PRECINCT_NAME]: {
          brooklyn99: 'Brooklyn Nine-Nine',
          westRiver: 'West River',
        },
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.PRECINCT_NAME]: {
          brooklyn99: 'Brooklyn Nueve-Nueve',
          westRiver: 'Río Oeste',
        },
      }),
    });
  },

  [ElectionStringKey.STATE_NAME]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      GpUnit: [
        {
          '@id': 'newYork',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            en: 'New York',
            'es-US': 'Nueva York',
          }),
          Type: BallotDefinition.ReportingUnitType.State,
        },
      ],
    });

    expect(uiStrings).toEqual({
      en: expect.objectContaining({
        [ElectionStringKey.STATE_NAME]: 'New York',
      }),
      'es-US': expect.objectContaining({
        [ElectionStringKey.STATE_NAME]: 'Nueva York',
      }),
    });
  },
};

test.each(Object.entries(tests))('extract %s', (_electionStringKey, testFn) =>
  testFn()
);

test('handles legacy numeric entity IDs', () => {
  const uiStrings = extractCdfUiStrings({
    ...testCdfBallotDefinition,
    GpUnit: [
      {
        '@id': '0',
        '@type': 'BallotDefinition.ReportingUnit',
        Name: buildInternationalizedText({
          en: 'Brooklyn Nine-Nine',
        }),
        Type: BallotDefinition.ReportingUnitType.Precinct,
      },
      {
        '@id': '1',
        '@type': 'BallotDefinition.ReportingUnit',
        Name: buildInternationalizedText({
          en: 'West River',
        }),
        Type: BallotDefinition.ReportingUnitType.Precinct,
      },
    ],
  });

  expect(uiStrings).toEqual({
    en: expect.objectContaining({
      [ElectionStringKey.PRECINCT_NAME]: {
        '0': 'Brooklyn Nine-Nine',
        '1': 'West River',
      },
    }),
  });
});

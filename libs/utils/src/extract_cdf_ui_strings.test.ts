import {
  BallotDefinition,
  ElectionStringKey,
  LanguageCode,
  testCdfBallotDefinition,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { extractCdfUiStrings } from './extract_cdf_ui_strings';

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

    expect(
      uiStrings[LanguageCode.ENGLISH]?.[ElectionStringKey.BALLOT_LANGUAGE]
    ).toBeUndefined();
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
      [LanguageCode.ENGLISH]: expect.objectContaining({
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
                [LanguageCode.ENGLISH]: 'Pinky and The Brain',
                [LanguageCode.SPANISH]: 'Pinky y Cerebro',
                unsupported_lang: '🌸🧠',
              }),
            },
            {
              ...assertDefined(originalCandidates[1]),
              '@id': 'candidate2',
              BallotName: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'Tom and Jerry',
                [LanguageCode.SPANISH]: 'Tom y Jerry',
                unsupported_lang: '🐈🐁',
              }),
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.CANDIDATE_NAME]: {
          candidate1: 'Pinky and The Brain',
          candidate2: 'Tom and Jerry',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
                [LanguageCode.ENGLISH]: 'Would you like apples or oranges?',
                [LanguageCode.CHINESE_TRADITIONAL]: '你想要蘋果還是橘子？',
                unsupported_lang: '🍎🍊',
              }),
              ContestOption: [],
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@id': 'contest2',
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'Would you like olives or pickles?',
                [LanguageCode.CHINESE_TRADITIONAL]: '您想要橄欖還是泡菜？',
                unsupported_lang: '🫒🥒',
              }),
              ContestOption: [],
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.CONTEST_DESCRIPTION]: {
          contest1: 'Would you like apples or oranges?',
          contest2: 'Would you like olives or pickles?',
        },
      }),
      [LanguageCode.CHINESE_TRADITIONAL]: expect.objectContaining({
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
                [LanguageCode.ENGLISH]: 'Apples or Oranges?',
              }),
              ContestOption: [
                {
                  '@id': 'appleOrOrangeOptionApple',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    [LanguageCode.ENGLISH]: 'Apples',
                    [LanguageCode.SPANISH]: 'Manzanas',
                    unsupported_lang: '🍎',
                  }),
                },
                {
                  '@id': 'appleOrOrangeOptionOrange',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    [LanguageCode.ENGLISH]: 'Oranges',
                    [LanguageCode.SPANISH]: 'Naranjas',
                    unsupported_lang: '🍊',
                  }),
                },
              ],
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@type': 'BallotDefinition.BallotMeasureContest',
              FullText: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'Apples or Bananas?',
              }),
              ContestOption: [
                {
                  '@id': 'appleOrBananaOptionApple',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    [LanguageCode.ENGLISH]: 'Apples',
                    [LanguageCode.SPANISH]: 'Manzanas',
                    unsupported_lang: '🍎',
                  }),
                },
                {
                  '@id': 'appleOrBananaOptionBanana',
                  '@type': 'BallotDefinition.BallotMeasureOption',
                  Selection: buildInternationalizedText({
                    [LanguageCode.ENGLISH]: 'Bananas',
                    [LanguageCode.SPANISH]: 'Plátanos',
                    unsupported_lang: '🍌',
                  }),
                },
              ],
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.CONTEST_OPTION_LABEL]: {
          appleOrOrangeOptionApple: 'Apples',
          appleOrBananaOptionApple: 'Apples',
          appleOrOrangeOptionOrange: 'Oranges',
          appleOrBananaOptionBanana: 'Bananas',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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

    expect(
      uiStrings[LanguageCode.ENGLISH]?.[ElectionStringKey.CONTEST_TERM]
    ).toBeUndefined();
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
                [LanguageCode.ENGLISH]: 'President',
                [LanguageCode.CHINESE_TRADITIONAL]: '總統',
                unsupported_lang: '🗳✅',
              }),
            },
            {
              ...assertDefined(ORIGINAL_ELECTION.Contest[1]),
              '@id': 'contest2',
              BallotTitle: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'Mayor',
                [LanguageCode.CHINESE_TRADITIONAL]: '市長',
                unsupported_lang: '🗳✅',
              }),
            },
          ],
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.CONTEST_TITLE]: {
          contest1: 'President',
          contest2: 'Mayor',
        },
      }),
      [LanguageCode.CHINESE_TRADITIONAL]: expect.objectContaining({
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
            [LanguageCode.ENGLISH]: 'Kings County',
            [LanguageCode.SPANISH]: 'Condado de Kings',
            unsupported_lang: '🗽',
          }),
          Type: BallotDefinition.ReportingUnitType.County,
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.COUNTY_NAME]: 'Kings County',
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
            [LanguageCode.ENGLISH]: 'District 9',
            [LanguageCode.SPANISH]: 'Distrito 9',
            unsupported_lang: '👽',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
        {
          '@id': 'notADistrict',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'Not A District',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
        {
          '@id': 'district10',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'District 10',
            [LanguageCode.SPANISH]: 'Distrito 10',
            unsupported_lang: '🛸',
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
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.DISTRICT_NAME]: {
          district9: 'District 9',
          district10: 'District 10',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
        [ElectionStringKey.DISTRICT_NAME]: {
          district9: 'Distrito 9',
          district10: 'Distrito 10',
        },
      }),
    });
  },

  [ElectionStringKey.ELECTION_DATE]() {
    const uiStrings = extractCdfUiStrings(testCdfBallotDefinition);

    expect(
      uiStrings[LanguageCode.ENGLISH]?.[ElectionStringKey.ELECTION_DATE]
    ).toBeUndefined();
  },

  [ElectionStringKey.ELECTION_TITLE]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...ORIGINAL_ELECTION,
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'General Election',
            [LanguageCode.SPANISH]: 'Elección General',
            unsupported_lang: '🗳✅',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.ELECTION_TITLE]: 'General Election',
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
            [LanguageCode.ENGLISH]: 'Block Party',
            [LanguageCode.SPANISH]: 'Fiesta En La Calle',
            unsupported_lang: '🥳',
          }),
        },
        {
          ...assertDefined(testCdfBallotDefinition.Party[1]),
          '@id': 'party2',
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'Pool Party',
            [LanguageCode.SPANISH]: 'Fiesta De Piscina',
            unsupported_lang: '🏖',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.PARTY_FULL_NAME]: {
          party1: 'Block Party',
          party2: 'Pool Party',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
          vxBallotLabel: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'Block Party',
            [LanguageCode.SPANISH]: 'Fiesta En La Calle',
            unsupported_lang: '🥳',
          }),
        },
        {
          ...assertDefined(testCdfBallotDefinition.Party[1]),
          '@id': 'party2',
          vxBallotLabel: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'Pool Party',
            [LanguageCode.SPANISH]: 'Fiesta De Piscina',
            unsupported_lang: '🏖',
          }),
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.PARTY_NAME]: {
          party1: 'Block Party',
          party2: 'Pool Party',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
            [LanguageCode.ENGLISH]: 'Brooklyn Nine-Nine',
            [LanguageCode.SPANISH]: 'Brooklyn Nueve-Nueve',
            unsupported_lang: '9️⃣',
          }),
          Type: BallotDefinition.ReportingUnitType.Precinct,
        },
        {
          '@id': 'westRiver',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'West River',
            [LanguageCode.SPANISH]: 'Río Oeste',
            unsupported_lang: '⬅️',
          }),
          Type: BallotDefinition.ReportingUnitType.Precinct,
        },
        {
          '@id': 'district9',
          '@type': 'BallotDefinition.ReportingUnit',
          Name: buildInternationalizedText({
            [LanguageCode.ENGLISH]: 'District9',
          }),
          Type: BallotDefinition.ReportingUnitType.Other,
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.PRECINCT_NAME]: {
          brooklyn99: 'Brooklyn Nine-Nine',
          westRiver: 'West River',
        },
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
            [LanguageCode.ENGLISH]: 'New York',
            [LanguageCode.SPANISH]: 'Nueva York',
            unsupported_lang: '🗽',
          }),
          Type: BallotDefinition.ReportingUnitType.State,
        },
      ],
    });

    expect(uiStrings).toEqual({
      [LanguageCode.ENGLISH]: expect.objectContaining({
        [ElectionStringKey.STATE_NAME]: 'New York',
      }),
      [LanguageCode.SPANISH]: expect.objectContaining({
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
          [LanguageCode.ENGLISH]: 'Brooklyn Nine-Nine',
        }),
        Type: BallotDefinition.ReportingUnitType.Precinct,
      },
      {
        '@id': '1',
        '@type': 'BallotDefinition.ReportingUnit',
        Name: buildInternationalizedText({
          [LanguageCode.ENGLISH]: 'West River',
        }),
        Type: BallotDefinition.ReportingUnitType.Precinct,
      },
    ],
  });

  expect(uiStrings).toEqual({
    [LanguageCode.ENGLISH]: expect.objectContaining({
      [ElectionStringKey.PRECINCT_NAME]: {
        '0': 'Brooklyn Nine-Nine',
        '1': 'West River',
      },
    }),
  });
});

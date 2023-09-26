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

/**
 * Test-per-ElectionStringKey mapping to make sure tests stay in  sync with
 * key changes.
 */
const tests: Record<ElectionStringKey, () => void> = {
  [ElectionStringKey.BALLOT_STYLE_ID]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...assertDefined(testCdfBallotDefinition.Election[0]),
          BallotStyle: [
            {
              ...assertDefined(
                testCdfBallotDefinition.Election[0]?.BallotStyle[0]
              ),
              ExternalIdentifier: [
                {
                  '@type': 'BallotDefinition.ExternalIdentifier',
                  Type: BallotDefinition.IdentifierType.StateLevel,
                  Value: 'ballot_style_1',
                },
              ],
            },
            {
              ...assertDefined(
                testCdfBallotDefinition.Election[0]?.BallotStyle[1]
              ),
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
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_DESCRIPTION]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_OPTION_LABEL]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.CONTEST_TITLE]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...assertDefined(testCdfBallotDefinition.Election[0]),
          Contest: [
            {
              ...assertDefined(testCdfBallotDefinition.Election[0]?.Contest[0]),
              '@id': 'contest1',
              BallotTitle: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'President',
                [LanguageCode.CHINESE]: '總統',
                unsupported_lang: '🗳✅',
              }),
            },
            {
              ...assertDefined(testCdfBallotDefinition.Election[0]?.Contest[1]),
              '@id': 'contest2',
              BallotTitle: buildInternationalizedText({
                [LanguageCode.ENGLISH]: 'Mayor',
                [LanguageCode.CHINESE]: '市長',
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
      [LanguageCode.CHINESE]: expect.objectContaining({
        [ElectionStringKey.CONTEST_TITLE]: {
          contest1: '總統',
          contest2: '市長',
        },
      }),
    });
  },

  [ElectionStringKey.COUNTY_NAME]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.DISTRICT_NAME]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.ELECTION_TITLE]() {
    const uiStrings = extractCdfUiStrings({
      ...testCdfBallotDefinition,
      Election: [
        {
          ...assertDefined(testCdfBallotDefinition.Election[0]),
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

  [ElectionStringKey.PARTY_NAME]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.PRECINCT_NAME]() {
    // TODO(kofi): Implement
  },

  [ElectionStringKey.STATE_NAME]() {
    // TODO(kofi): Implement
  },
};

for (const [electionStringKey, testFn] of Object.entries(tests)) {
  test(electionStringKey, testFn);
}

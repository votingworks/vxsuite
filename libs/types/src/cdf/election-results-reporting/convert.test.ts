import { assert } from '@votingworks/basics';
import { ResultsReporting } from '../..';
import { LanguageCode } from '../../language_code';
import {
  findBallotMeasureSelectionWithContent,
  findLanguageString,
  convertElectionResultsReportingReportToVxManualResults,
  LanguageStringQueryParams,
} from './convert';
import {
  testElectionReport,
  testElectionReportNoOtherCounts,
  testElectionReportUnsupportedContestType,
} from './fixtures';
import { ManualElectionResults } from '../../tabulation';

function makeLanguageString(
  content: string,
  language: LanguageCode
): ResultsReporting.LanguageString {
  return {
    '@type': 'ElectionResults.LanguageString',
    Content: content,
    Language: language,
  };
}

interface FindLanguageStringTestSpec {
  testDescription: string;
  textEntries: readonly ResultsReporting.LanguageString[];
  params: LanguageStringQueryParams;
  expected?: ResultsReporting.LanguageString;
}

const spanishLanguageString = makeLanguageString('hola', LanguageCode.SPANISH);
const englishLanguageString = makeLanguageString('hello', LanguageCode.ENGLISH);

const findLanguageStringTestParams: FindLanguageStringTestSpec[] = [
  {
    testDescription: 'finds match default params',
    textEntries: [spanishLanguageString, englishLanguageString],
    params: {},
    expected: englishLanguageString,
  },
  {
    testDescription: 'finds match for language param only',
    params: { language: LanguageCode.SPANISH },
    textEntries: [englishLanguageString, spanishLanguageString],
    expected: spanishLanguageString,
  },
  {
    testDescription: 'defaults to English when no language param is provided',
    params: { content: /Example Content/ },
    textEntries: [
      makeLanguageString('Example Content', LanguageCode.SPANISH),
      makeLanguageString('Example Content', LanguageCode.ENGLISH),
    ],
    expected: makeLanguageString('Example Content', LanguageCode.ENGLISH),
  },
  {
    testDescription: 'finds match for both language and content params',
    params: { language: LanguageCode.SPANISH, content: /Example Content/ },
    textEntries: [
      makeLanguageString('Example Content', LanguageCode.SPANISH),
      makeLanguageString('Example Content', LanguageCode.ENGLISH),
    ],
    expected: makeLanguageString('Example Content', LanguageCode.SPANISH),
  },
  {
    testDescription: 'returns undefined when no match is found',
    params: { content: /Other/ },
    textEntries: [
      makeLanguageString('Example Content', LanguageCode.SPANISH),
      makeLanguageString('Example Content', LanguageCode.ENGLISH),
    ],
    expected: undefined,
  },
];

test.each(findLanguageStringTestParams)(
  'findLanguageString $testDescription',
  ({ textEntries, params, expected }) => {
    const result = findLanguageString(textEntries, params);
    if (expected) {
      assert(result, 'Expected to find a LanguageString');
      expect(result.Content).toEqual(expected.Content);
      expect(result.Language).toEqual(expected.Language);
    } else {
      expect(result).toBeUndefined();
    }
  }
);

describe('findBallotMeasureSelectionWithContent', () => {
  test('can find a ballot measure', () => {
    const yesId = '123';
    const noId = '456';
    const ballotMeasureSelections: ResultsReporting.BallotMeasureSelection[] = [
      {
        '@id': yesId,
        '@type': 'ElectionResults.BallotMeasureSelection',
        Selection: {
          '@type': 'ElectionResults.InternationalizedText',
          Text: [makeLanguageString('Yes', LanguageCode.ENGLISH)],
        },
      },
      {
        '@id': noId,
        '@type': 'ElectionResults.BallotMeasureSelection',
        Selection: {
          '@type': 'ElectionResults.InternationalizedText',
          Text: [makeLanguageString('No', LanguageCode.ENGLISH)],
        },
      },
    ];

    const result = findBallotMeasureSelectionWithContent(
      /yes/i,
      ballotMeasureSelections
    );
    assert(result, 'Expected ballot measure selection to be defined');
    expect(result['@id']).toEqual(yesId);
  });

  test('throws an error if no matching ballot measure selection exists', () => {
    const ballotMeasureSelections: ResultsReporting.BallotMeasureSelection[] =
      [];

    expect(() => {
      findBallotMeasureSelectionWithContent(/yes/i, ballotMeasureSelections);
    }).toThrow('Could not find ballot measure selection with content "/yes/i"');
  });
});

describe('getManualResultsFromErrElectionResults', () => {
  test('converting an ERR election', () => {
    const expected: ManualElectionResults = {
      contestResults: {
        fishing: {
          contestId: 'fishing',
          contestType: 'yesno',
          yesOptionId: 'fishing-yes',
          noOptionId: 'fishing-no',
          yesTally: 50,
          noTally: 40,
          overvotes: 7,
          undervotes: 3,
          ballots: 100,
        },
        judge: {
          contestId: 'judge',
          contestType: 'yesno',
          yesOptionId: 'retain-yes',
          noOptionId: 'retain-no',
          yesTally: 55,
          noTally: 35,
          overvotes: 6,
          undervotes: 4,
          ballots: 100,
        },
        'best-animal-mammal': {
          contestId: 'best-animal-mammal',
          contestType: 'candidate',
          votesAllowed: 1,
          overvotes: 7,
          undervotes: 3,
          ballots: 100,
          tallies: {
            zebra: {
              id: 'zebra',
              name: 'Zebra',
              tally: 90,
            },
          },
        },
      },
      ballotCount: 100,
    };
    const results =
      convertElectionResultsReportingReportToVxManualResults(
        testElectionReport
      );
    expect(results.ok()).toEqual(expected);
  });

  test('when no overvotes or undervotes are reported', () => {
    const expected: ManualElectionResults = {
      contestResults: {
        fishing: {
          contestId: 'fishing',
          contestType: 'yesno',
          yesOptionId: 'fishing-yes',
          noOptionId: 'fishing-no',
          yesTally: 60,
          noTally: 40,
          overvotes: 0,
          undervotes: 0,
          ballots: 100,
        },
        'best-animal-mammal': {
          contestId: 'best-animal-mammal',
          contestType: 'candidate',
          votesAllowed: 1,
          overvotes: 0,
          undervotes: 0,
          ballots: 90,
          tallies: {
            zebra: {
              id: 'zebra',
              name: 'Zebra',
              tally: 90,
            },
          },
        },
      },
      ballotCount: 100,
    };
    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportNoOtherCounts
    );
    expect(results.ok()).toEqual(expected);
  });

  test('return an error for unsupported contest type', () => {
    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportUnsupportedContestType
    );
    expect(results.isErr()).toEqual(true);
    expect(results.err()?.message).toEqual(
      'Unsupported ERR contest type ElectionResults.PartyContest'
    );
  });
});

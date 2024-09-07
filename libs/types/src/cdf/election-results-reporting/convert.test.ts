import { assert, assertDefined } from '@votingworks/basics';
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
  testElectionReportInvalidBallotTotal,
  testElectionReportNoOtherCounts,
  testElectionReportUnsupportedContestType,
  testElectionReportWriteIns,
} from './fixtures';
import { ManualElectionResults } from '../../tabulation';
import { ElectionReport } from '.';

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
  expected: ResultsReporting.LanguageString | null;
}

const spanishLanguageString = makeLanguageString('hola', LanguageCode.SPANISH);
const englishLanguageString = makeLanguageString('hello', LanguageCode.ENGLISH);

function getValidCandidateIds(report: ElectionReport) {
  const election = assertDefined(report.Election)[0];
  const ids = new Set<string>();
  for (const candidate of election.Candidate || []) {
    ids.add(candidate['@id']);
  }

  return ids;
}

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
    testDescription: 'returns null when no match is found',
    params: { content: /Other/ },
    textEntries: [
      makeLanguageString('Example Content', LanguageCode.SPANISH),
      makeLanguageString('Example Content', LanguageCode.ENGLISH),
    ],
    expected: null,
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
      expect(expected).toBeNull();
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
          yesTally: 30,
          noTally: 29,
          overvotes: 1,
          undervotes: 5,
          ballots: 65,
        },
        judge: {
          contestId: 'judge',
          contestType: 'yesno',
          yesOptionId: 'retain-yes',
          noOptionId: 'retain-no',
          yesTally: 55,
          noTally: 10,
          overvotes: 0,
          undervotes: 0,
          ballots: 65,
        },
        council: {
          contestId: 'council',
          contestType: 'candidate',
          votesAllowed: 2,
          overvotes: 8,
          undervotes: 2,
          ballots: 65,
          tallies: {
            'barchi-hallaren': {
              id: 'barchi-hallaren',
              name: 'Joseph Barchi and Joseph Hallaren',
              tally: 60,
            },
            'cramer-vuocolo': {
              id: 'cramer-vuocolo',
              name: 'Adam Cramer and Greg Vuocolo',
              tally: 30,
            },
            'court-blumhardt': {
              id: 'court-blumhardt',
              name: 'Daniel Court and Amy Blumhardt',
              tally: 30,
            },
          },
        },
      },
      ballotCount: 65,
    };

    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReport,
      getValidCandidateIds(testElectionReport)
    );
    expect(results.ok()).toEqual(expected);
  });

  test('converting an ERR election with write-ins', () => {
    const expected: ManualElectionResults = {
      contestResults: {
        'best-animal-mammal': {
          contestId: 'best-animal-mammal',
          contestType: 'candidate',
          votesAllowed: 1,
          overvotes: 0,
          undervotes: 0,
          ballots: 10,
          tallies: {
            zebra: {
              id: 'zebra',
              name: 'Zebra',
              tally: 6,
            },
            'temp-write-in-ibex-02': {
              id: 'temp-write-in-ibex-02',
              isWriteIn: true,
              name: 'Ibex',
              tally: 4,
            },
          },
        },
      },
      ballotCount: 10,
    };
    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportWriteIns,
      getValidCandidateIds(testElectionReportWriteIns)
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
      testElectionReportNoOtherCounts,
      getValidCandidateIds(testElectionReportNoOtherCounts)
    );
    expect(results.ok()).toEqual(expected);
  });

  test('returns an error if a non-write-in candidate ID in the ERR report is not a known ID', () => {
    // Known IDs are intended to represent candidate IDs in a VX election definition but are technically arbitrary
    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReport,
      new Set<string>()
    );
    expect(results.isErr()).toEqual(true);
    expect(results.err()?.message).toEqual(
      'Candidate ID in ERR file has no matching ID in VX election definition: barchi-hallaren'
    );
  });

  test('returns an error for unsupported contest type', () => {
    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportUnsupportedContestType,
      getValidCandidateIds(testElectionReportUnsupportedContestType)
    );
    expect(results.isErr()).toEqual(true);
    expect(results.err()?.message).toEqual(
      'Unsupported Election Results Reporting contest type ElectionResults.PartyContest'
    );
  });

  test('when total ballot count computation results in a non-integer result', () => {
    const result = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportInvalidBallotTotal,
      getValidCandidateIds(testElectionReportInvalidBallotTotal)
    );
    expect(result.isErr()).toEqual(true);
    expect(result.err()?.message).toEqual(
      'Expected an integer value for total ballots but got 4.5'
    );
  });
});

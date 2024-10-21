import { assert, assertDefined } from '@votingworks/basics';
import { ResultsReporting } from '../..';
import {
  findBallotMeasureSelectionWithContent,
  findLanguageString,
  convertElectionResultsReportingReportToVxManualResults,
  LanguageStringQueryParams,
} from './convert';
import {
  testElectionReport,
  testElectionReportExportedFromVxAdmin,
  testElectionReportInvalidBallotTotal,
  testElectionReportNoOtherCounts,
  testElectionReportUnsupportedContestType,
  testElectionReportWriteIns,
  testElectionReportYesNoContest,
  testElectionReportYesNoContestWithoutTextMatch,
} from './fixtures';
import { ManualElectionResults } from '../../tabulation';
import { ElectionReport } from '.';

function makeLanguageString(
  content: string,
  language: string
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

const spanishLanguageString = makeLanguageString('hola', 'es-US');
const englishLanguageString = makeLanguageString('hello', 'en');

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
    params: { language: 'es-US' },
    textEntries: [englishLanguageString, spanishLanguageString],
    expected: spanishLanguageString,
  },
  {
    testDescription: 'defaults to English when no language param is provided',
    params: { content: /Example Content/ },
    textEntries: [
      makeLanguageString('Example Content', 'es-US'),
      makeLanguageString('Example Content', 'en'),
    ],
    expected: makeLanguageString('Example Content', 'en'),
  },
  {
    testDescription: 'finds match for both language and content params',
    params: { language: 'es-US', content: /Example Content/ },
    textEntries: [
      makeLanguageString('Example Content', 'es-US'),
      makeLanguageString('Example Content', 'en'),
    ],
    expected: makeLanguageString('Example Content', 'es-US'),
  },
  {
    testDescription: 'returns null when no match is found',
    params: { content: /Other/ },
    textEntries: [
      makeLanguageString('Example Content', 'es-US'),
      makeLanguageString('Example Content', 'en'),
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
          Text: [makeLanguageString('Yes', 'en')],
        },
      },
      {
        '@id': noId,
        '@type': 'ElectionResults.BallotMeasureSelection',
        Selection: {
          '@type': 'ElectionResults.InternationalizedText',
          Text: [makeLanguageString('No', 'en')],
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

  test('returns undefined if no match', () => {
    const ballotMeasureSelections: ResultsReporting.BallotMeasureSelection[] =
      [];

    const selection = findBallotMeasureSelectionWithContent(
      /yes/i,
      ballotMeasureSelections
    );
    expect(selection).toBeUndefined();
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
              tally: 25,
            },
            'temp-write-in-boone-lian': {
              id: 'temp-write-in-boone-lian',
              isWriteIn: true,
              name: 'Alvin Boone and James Lian',
              tally: 5,
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

  test('converting an ERR election in the format exported by VxAdmin', () => {
    const expected: ManualElectionResults = {
      contestResults: {
        council: {
          contestId: 'council',
          contestType: 'candidate',
          votesAllowed: 1,
          overvotes: 0,
          undervotes: 0,
          ballots: 100,
          tallies: {
            'barchi-hallaren': {
              id: 'barchi-hallaren',
              name: 'Joseph Barchi and Joseph Hallaren',
              tally: 60,
            },
            'cramer-vuocolo': {
              id: 'cramer-vuocolo',
              name: 'Adam Cramer and Greg Vuocolo',
              tally: 40,
            },
          },
        },
      },
      ballotCount: 100,
    };

    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportExportedFromVxAdmin,
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

  test('yes no ContestSelections defaults "yes" to first ContestSelection', () => {
    const expected: ManualElectionResults = {
      contestResults: {
        fishing: {
          contestId: 'fishing',
          contestType: 'yesno',
          yesOptionId: 'fishing-for',
          noOptionId: 'fishing-against',
          yesTally: 45,
          noTally: 55,
          overvotes: 0,
          undervotes: 0,
          ballots: 100,
        },
      },
      ballotCount: 100,
    };

    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportYesNoContestWithoutTextMatch,
      getValidCandidateIds(testElectionReportNoOtherCounts)
    );
    expect(results.ok()).toEqual(expected);
  });

  test('yes no ContestSelections match on text', () => {
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
      },
      ballotCount: 100,
    };

    const results = convertElectionResultsReportingReportToVxManualResults(
      testElectionReportYesNoContest,
      getValidCandidateIds(testElectionReportNoOtherCounts)
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

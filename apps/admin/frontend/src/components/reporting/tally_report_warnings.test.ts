import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  ContestResultsSummary,
  buildElectionResultsFixture,
  buildSimpleMockTallyReportResults,
  getEmptyCardCounts,
} from '@votingworks/utils';
import { Admin, ContestId } from '@votingworks/types';
import { typedAs } from '@votingworks/basics';
import {
  TallyReportWarning,
  getTallyReportWarning,
  getTallyReportWarningText,
} from './tally_report_warnings';

describe('getTallyReportWarning', () => {
  test('does give warning when there are no reports', () => {
    expect(
      getTallyReportWarning({
        allTallyReports: [],
        election: electionTwoPartyPrimary,
      })
    ).toEqual({
      type: 'no-reports-match-filter',
    });
  });

  test("doesn't give a warning on zero report", () => {
    const { election } = electionFamousNames2021Fixtures;
    expect(
      getTallyReportWarning({
        allTallyReports: [
          buildSimpleMockTallyReportResults({
            election,
            scannedBallotCount: 0,
          }),
        ],
        election,
      })
    ).toEqual({
      type: 'none',
    });
  });

  test('does give warning when contest has votes all for one option', () => {
    const election = electionTwoPartyPrimary;

    const testCase: Array<{
      contestResultsSummaries: Record<string, ContestResultsSummary>;
      expectedContestIds: ContestId[];
    }> = [
      {
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 25,
            yesTally: 25,
            noTally: 0,
          },
        },
        expectedContestIds: ['fishing'],
      },
      {
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 25,
            yesTally: 0,
            noTally: 25,
          },
        },
        expectedContestIds: ['fishing'],
      },
      {
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 25,
            undervotes: 25,
          },
        },
        expectedContestIds: ['fishing'],
      },
      {
        contestResultsSummaries: {
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 25,
            officialOptionTallies: {
              lion: 25,
            },
          },
        },
        expectedContestIds: ['zoo-council-mammal'],
      },
      {
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 25,
            yesTally: 25,
            noTally: 0,
          },
          'zoo-council-mammal': {
            type: 'candidate',
            ballots: 25,
            officialOptionTallies: {
              lion: 25,
            },
          },
        },
        expectedContestIds: ['zoo-council-mammal', 'fishing'],
      },
    ];

    for (const { contestResultsSummaries, expectedContestIds } of testCase) {
      const tallyReport: Admin.TallyReportResults = {
        hasPartySplits: true,
        contestIds: [],
        cardCountsByParty: {
          '0': getEmptyCardCounts(),
          '1': getEmptyCardCounts(),
        },
        scannedResults: buildElectionResultsFixture({
          election,
          cardCounts: {
            bmd: 20,
            hmpb: [],
          },
          contestResultsSummaries,
          includeGenericWriteIn: false,
        }),
      };

      expect(
        getTallyReportWarning({ allTallyReports: [tallyReport], election })
      ).toEqual(
        typedAs<TallyReportWarning>({
          type: 'privacy',
          subType: 'contest-same-vote',
          contestIds: expectedContestIds,
          isOnlyOneReport: false,
        })
      );
    }
  });

  test('does give warning when ballot count is low', () => {
    const { election } = electionFamousNames2021Fixtures;
    const tallyReport: Admin.TallyReportResults = {
      hasPartySplits: false,
      cardCounts: {
        bmd: 5,
        hmpb: [],
      },
      contestIds: [],
      scannedResults: buildElectionResultsFixture({
        election,
        cardCounts: {
          bmd: 5,
          hmpb: [],
        },
        contestResultsSummaries: {},
        includeGenericWriteIn: false,
      }),
    };

    expect(
      getTallyReportWarning({
        allTallyReports: [tallyReport],
        election,
      })
    ).toEqual(
      typedAs<TallyReportWarning>({
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport: true,
      })
    );
  });
});

test('getTallyReportWarningText', () => {
  const election = electionTwoPartyPrimary;

  const testCase: Array<{
    tallyReportWarning: TallyReportWarning;
    expected: string;
  }> = [
    {
      tallyReportWarning: {
        type: 'none',
      },
      expected: '',
    },
    {
      tallyReportWarning: {
        type: 'no-reports-match-filter',
      },
      expected: 'The current report parameters do not match any ballots.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport: true,
      },
      expected:
        'This tally report contains fewer than 10 ballots, which may pose a voter privacy risk.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport: false,
      },
      expected:
        'A section of this tally report contains fewer than 10 ballots, which may pose a voter privacy risk.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing'],
        isOnlyOneReport: true,
      },
      expected:
        'This tally report has a contest where all votes are for the same option, which may pose a voter privacy risk. Check Ballot Measure 3.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing', 'zoo-council-mammal'],
        isOnlyOneReport: true,
      },
      expected:
        'This tally report has contests where all votes are for the same option, which may pose a voter privacy risk. Check Ballot Measure 3 and Zoo Council.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing', 'zoo-council-mammal', 'best-animal-mammal'],
        isOnlyOneReport: true,
      },
      expected:
        'This tally report has contests where all votes are for the same option, which may pose a voter privacy risk. Check Ballot Measure 3, Zoo Council, and Best Animal.',
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: [
          'fishing',
          'zoo-council-mammal',
          'best-animal-mammal',
          'new-zoo-either',
        ],
        isOnlyOneReport: true,
      },
      expected:
        'This tally report has contests where all votes are for the same option, which may pose a voter privacy risk.',
    },
  ];

  for (const { tallyReportWarning, expected } of testCase) {
    expect(
      getTallyReportWarningText({
        election,
        tallyReportWarning,
      })
    ).toEqual(expected);
  }
});

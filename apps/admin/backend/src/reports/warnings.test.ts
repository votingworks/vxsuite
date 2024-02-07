import {
  ContestResultsSummary,
  buildElectionResultsFixture,
  buildManualResultsFixture,
  buildSimpleMockTallyReportResults,
  getEmptyCardCounts,
} from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { Admin, ContestId, Tabulation } from '@votingworks/types';
import {
  TallyReportWarning,
  getBallotCountReportWarning,
  getTallyReportWarning,
} from './warnings';

describe('getBallotCountReportWarning', () => {
  test('does give warning when there are no reports', () => {
    expect(
      getBallotCountReportWarning({
        allCardCounts: [],
      })
    ).toEqual({
      type: 'no-reports-match-filter',
    });
  });

  test("doesn't give a warning on zero report", () => {
    expect(
      getBallotCountReportWarning({
        allCardCounts: [getEmptyCardCounts()],
      })
    ).toEqual({
      type: 'none',
    });
  });
});

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

  test('includes manual results   assessing all-same-vote privacy risk', () => {
    const election = electionTwoPartyPrimary;

    const scannedResults: Tabulation.ElectionResults =
      buildElectionResultsFixture({
        election,
        cardCounts: {
          bmd: 25,
          hmpb: [],
        },
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 25,
            yesTally: 25,
            noTally: 0,
          },
        },
        includeGenericWriteIn: false,
      });

    const tallyReportWithoutManualResults: Admin.TallyReportResults = {
      hasPartySplits: true,
      contestIds: [],
      cardCountsByParty: {
        '0': getEmptyCardCounts(),
        '1': getEmptyCardCounts(),
      },
      scannedResults,
    };

    const tallyReportWithManualResults: Admin.TallyReportResults = {
      hasPartySplits: true,
      contestIds: [],
      cardCountsByParty: {
        '0': getEmptyCardCounts(),
        '1': getEmptyCardCounts(),
      },
      scannedResults,
      manualResults: buildManualResultsFixture({
        ballotCount: 10,
        election,
        contestResultsSummaries: {
          fishing: {
            type: 'yesno',
            ballots: 10,
            yesTally: 9,
            noTally: 1, // this should prevent the warning
          },
        },
      }),
    };

    expect(
      getTallyReportWarning({
        allTallyReports: [tallyReportWithoutManualResults],
        election,
      })
    ).toEqual(
      typedAs<TallyReportWarning>({
        contestIds: ['fishing'],
        isOnlyOneReport: false,
        subType: 'contest-same-vote',
        type: 'privacy',
      })
    );

    expect(
      getTallyReportWarning({
        allTallyReports: [tallyReportWithManualResults],
        election,
      })
    ).toEqual(
      typedAs<TallyReportWarning>({
        type: 'none',
      })
    );
  });
});

import { electionTwoPartyPrimary } from '@votingworks/fixtures';
import type { TallyReportWarning } from '@votingworks/admin-backend';
import { getTallyReportWarningText } from './tally_report_warnings';

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

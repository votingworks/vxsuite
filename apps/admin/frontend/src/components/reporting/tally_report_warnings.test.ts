import { electionTwoPartyPrimary } from '@votingworks/fixtures';
import type { TallyReportWarning } from '@votingworks/admin-backend';
import {
  getTallyReportWarningText,
  TallyReportWarningText,
} from './tally_report_warnings';

test('getTallyReportWarningText', () => {
  const election = electionTwoPartyPrimary;

  const testCase: Array<{
    tallyReportWarning: TallyReportWarning;
    expected: TallyReportWarningText;
  }> = [
    {
      tallyReportWarning: { type: 'content-too-large' },
      expected: {
        body: 'This report is too large to be exported as a PDF. You may export the report as a CSV instead.',
      },
    },
    {
      tallyReportWarning: {
        type: 'no-reports-match-filter',
      },
      expected: {
        body: 'The current report parameters do not match any ballots.',
      },
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport: true,
      },
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'This tally report includes fewer than 10 ballots.',
      },
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport: false,
      },
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'A section of this tally report includes fewer than 10 ballots.',
      },
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing'],
        isOnlyOneReport: true,
      },
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'This tally report includes a contest where all votes are for the same option. Check Ballot Measure 3.',
      },
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing', 'zoo-council-mammal'],
        isOnlyOneReport: true,
      },
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'This tally report includes contests where all votes are for the same option. Check Ballot Measure 3 and Zoo Council.',
      },
    },
    {
      tallyReportWarning: {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: ['fishing', 'zoo-council-mammal', 'best-animal-mammal'],
        isOnlyOneReport: true,
      },
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'This tally report includes contests where all votes are for the same option. Check Ballot Measure 3, Zoo Council, and Best Animal.',
      },
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
      expected: {
        header: 'Potential Voter Privacy Risk',
        body: 'This tally report includes contests where all votes are for the same option.',
      },
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

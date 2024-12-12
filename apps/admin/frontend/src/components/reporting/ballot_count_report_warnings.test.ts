import { expect, test } from 'vitest';
import type { BallotCountReportWarning } from '@votingworks/admin-backend';
import { getBallotCountReportWarningText } from './ballot_count_report_warnings';

test('getBallotCountReportWarningText', () => {
  const testCase: Array<{
    ballotCountReportWarning: BallotCountReportWarning;
    expected: string;
  }> = [
    {
      ballotCountReportWarning: { type: 'content-too-large' },
      expected:
        'This report is too large to be exported as a PDF. You may export the report as a CSV instead.',
    },
    {
      ballotCountReportWarning: { type: 'no-reports-match-filter' },
      expected: 'The current report parameters do not match any ballots.',
    },
  ];

  for (const { ballotCountReportWarning, expected } of testCase) {
    expect(
      getBallotCountReportWarningText({
        ballotCountReportWarning,
      })
    ).toEqual(expected);
  }
});

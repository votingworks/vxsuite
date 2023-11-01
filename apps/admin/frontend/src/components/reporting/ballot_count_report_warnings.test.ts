import { getEmptyCardCounts } from '@votingworks/utils';
import {
  BallotCountReportWarning,
  getBallotCountReportWarning,
  getBallotCountReportWarningText,
} from './ballot_count_report_warnings';

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

test('getBallotCountReportWarningText', () => {
  const testCase: Array<{
    ballotCountReportWarning: BallotCountReportWarning;
    expected: string;
  }> = [
    {
      ballotCountReportWarning: {
        type: 'none',
      },
      expected: '',
    },
    {
      ballotCountReportWarning: {
        type: 'no-reports-match-filter',
      },
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

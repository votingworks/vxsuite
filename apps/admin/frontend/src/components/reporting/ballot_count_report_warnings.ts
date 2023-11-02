import { Tabulation } from '@votingworks/types';

export type BallotCountReportWarning =
  | {
      type: 'none';
    }
  | {
      type: 'no-reports-match-filter';
    };

export function getBallotCountReportWarning({
  allCardCounts,
}: {
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>;
}): BallotCountReportWarning {
  if (allCardCounts.length === 0) {
    return {
      type: 'no-reports-match-filter',
    };
  }

  return { type: 'none' };
}

interface BallotCountReportWarningProps {
  ballotCountReportWarning: BallotCountReportWarning;
}

export function getBallotCountReportWarningText({
  ballotCountReportWarning,
}: BallotCountReportWarningProps): string {
  if (ballotCountReportWarning.type === 'no-reports-match-filter') {
    return `The current report parameters do not match any ballots.`;
  }

  return '';
}

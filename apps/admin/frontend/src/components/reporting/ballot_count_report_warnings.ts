import type { BallotCountReportWarning } from '@votingworks/admin-backend';

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

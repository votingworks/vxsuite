import type { BallotCountReportWarning } from '@votingworks/admin-backend';
import { throwIllegalValue } from '@votingworks/basics';

interface BallotCountReportWarningProps {
  ballotCountReportWarning: BallotCountReportWarning;
}

export function getBallotCountReportWarningText({
  ballotCountReportWarning,
}: BallotCountReportWarningProps): string {
  switch (ballotCountReportWarning.type) {
    case 'no-reports-match-filter':
      return `The current report parameters do not match any ballots.`;
    case 'content-too-large':
      return `This report is too large to be exported as a PDF. You may export the report as a CSV instead.`;
    default: {
      /* istanbul ignore next - @preserve */
      throwIllegalValue(ballotCountReportWarning);
    }
  }
}

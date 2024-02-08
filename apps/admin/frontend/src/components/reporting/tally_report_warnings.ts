import type { TallyReportWarning } from '@votingworks/admin-backend';
import { throwIllegalValue } from '@votingworks/basics';
import { Election, Tabulation, getContestsFromIds } from '@votingworks/types';

function oxfordCommaJoin(items: string[]): string {
  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.slice(-1)}`;
}

interface TallyReportWarningProps {
  tallyReportWarning: TallyReportWarning;
  election: Election;
}

export function getTallyReportWarningText({
  tallyReportWarning,
  election,
}: TallyReportWarningProps): string {
  if (tallyReportWarning.type === 'none') {
    return '';
  }

  if (tallyReportWarning.type === 'no-reports-match-filter') {
    return `The current report parameters do not match any ballots.`;
  }

  const targetReportLabel = tallyReportWarning.isOnlyOneReport
    ? 'This tally report'
    : `A section of this tally report`;

  switch (tallyReportWarning.subType) {
    case 'low-ballot-count':
      return `${targetReportLabel} contains fewer than ${Tabulation.TALLY_REPORT_PRIVACY_THRESHOLD} ballots, which may pose a voter privacy risk.`;
    case 'contest-same-vote': {
      const contests = getContestsFromIds(
        election,
        tallyReportWarning.contestIds
      );
      const baseWarningText = `${targetReportLabel} has ${
        contests.length > 1 ? 'contests' : 'a contest'
      } where all votes are for the same option, which may pose a voter privacy risk.`;
      if (contests.length <= 3) {
        return `${baseWarningText} Check ${oxfordCommaJoin(
          contests.map((c) => c.title)
        )}.`;
      }

      return baseWarningText;
    }
    // istanbul ignore next
    default:
      throwIllegalValue(tallyReportWarning, 'subType');
  }
}

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

export interface TallyReportWarningText {
  header?: string;
  body: string;
}

export function getTallyReportWarningText({
  tallyReportWarning,
  election,
}: TallyReportWarningProps): TallyReportWarningText {
  switch (tallyReportWarning.type) {
    case 'no-reports-match-filter':
      return {
        body: `The current report parameters do not match any ballots.`,
      };

    case 'content-too-large':
      return {
        body: `This report is too large to be exported as a PDF. You may export the report as a CSV instead.`,
      };

    case 'privacy': {
      const targetReportLabel = tallyReportWarning.isOnlyOneReport
        ? 'This tally report'
        : `A section of this tally report`;

      switch (tallyReportWarning.subType) {
        case 'low-ballot-count':
          return {
            header: 'Potential Voter Privacy Risk',
            body: `${targetReportLabel} includes fewer than ${Tabulation.TALLY_REPORT_PRIVACY_THRESHOLD} ballots.`,
          };
        case 'contest-same-vote': {
          const contests = getContestsFromIds(
            election,
            tallyReportWarning.contestIds
          );
          const baseWarningText = `${targetReportLabel} includes ${
            contests.length > 1 ? 'contests' : 'a contest'
          } where all votes are for the same option.`;
          if (contests.length <= 3) {
            return {
              header: 'Potential Voter Privacy Risk',
              body: `${baseWarningText} Check ${oxfordCommaJoin(
                contests.map((c) => c.title)
              )}.`,
            };
          }

          return {
            header: 'Potential Voter Privacy Risk',
            body: baseWarningText,
          };
        }
        // istanbul ignore next
        default:
          return throwIllegalValue(tallyReportWarning, 'subType');
      }
    }
    // istanbul ignore next
    default:
      throwIllegalValue(tallyReportWarning, 'type');
  }
}

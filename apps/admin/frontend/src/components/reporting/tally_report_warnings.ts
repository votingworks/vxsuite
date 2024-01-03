import { throwIllegalValue } from '@votingworks/basics';
import {
  Admin,
  ContestId,
  Election,
  Tabulation,
  getContestsFromIds,
} from '@votingworks/types';
import {
  combineElectionResults,
  convertManualElectionResults,
  getBallotCount,
} from '@votingworks/utils';

type TallyReportPrivacyWarning =
  | {
      type: 'privacy';
      subType: 'low-ballot-count';
      isOnlyOneReport: boolean;
    }
  | {
      type: 'privacy';
      subType: 'contest-same-vote';
      contestIds: ContestId[];
      isOnlyOneReport: boolean;
    };

export type TallyReportWarning =
  | {
      type: 'none';
    }
  | {
      type: 'no-reports-match-filter';
    }
  | TallyReportPrivacyWarning;

function isLowBallotCountPrivacyRisk(ballotCount: number): boolean {
  return (
    ballotCount > 0 && ballotCount < Tabulation.TALLY_REPORT_PRIVACY_THRESHOLD
  );
}

/**
 * Checks if all votes in a contest are for the same option or candidate. This
 * is a simple proxy for whether contest results constitute a privacy risk, and
 * could certainly be improved in the future.
 */
function contestHasAllSameVote(
  contestResults: Tabulation.ContestResults
): boolean {
  if (contestResults.ballots === 0) return false;

  if (contestResults.undervotes === contestResults.ballots) return true;

  if (contestResults.contestType === 'yesno') {
    return (
      contestResults.yesTally === contestResults.ballots ||
      contestResults.noTally === contestResults.ballots
    );
  }

  return Object.values(contestResults.tallies).some(
    (candidateTally) => candidateTally.tally === contestResults.ballots
  );
}

/**
 * Returns the contest IDs of contests where all votes are the same.
 */
function getAllSameVoteContestIds({
  tallyReport,
  election,
}: {
  tallyReport: Admin.TallyReportResults;
  election: Election;
}): ContestId[] {
  // The current operating assumption is that the difference between manual and
  // scanned ballots is not relevant to this privacy, so we combine them.
  const allElectionResults = tallyReport.manualResults
    ? [
        tallyReport.scannedResults,
        convertManualElectionResults(tallyReport.manualResults),
      ]
    : [tallyReport.scannedResults];
  const electionResults = combineElectionResults({
    election,
    allElectionResults,
  });

  const allSameVoteContestIds: ContestId[] = [];

  for (const contestResults of Object.values(electionResults.contestResults)) {
    if (contestHasAllSameVote(contestResults)) {
      allSameVoteContestIds.push(contestResults.contestId);
    }
  }

  return allSameVoteContestIds;
}

export function getTallyReportWarning({
  allTallyReports,
  election,
}: {
  allTallyReports: Tabulation.GroupList<Admin.TallyReportResults>;
  election: Election;
}): TallyReportWarning {
  if (allTallyReports.length === 0) {
    return {
      type: 'no-reports-match-filter',
    };
  }

  // The tally report type can contain either a single set of results for
  // a general election, or multiple sets of results for a primary election.
  // We want to separate the ballot counts out for each.
  const allCardCounts = allTallyReports.flatMap((tallyReport) => {
    if (tallyReport.hasPartySplits) {
      return Object.values(tallyReport.cardCountsByParty);
    }

    return [tallyReport.cardCounts];
  });
  const isOnlyOneReport = allCardCounts.length === 1;

  // Check for the privacy risk of contests with all the same vote
  for (const tallyReport of allTallyReports) {
    const sameVoteContestIds = getAllSameVoteContestIds({
      tallyReport,
      election,
    });

    if (sameVoteContestIds.length > 0) {
      return {
        type: 'privacy',
        subType: 'contest-same-vote',
        contestIds: sameVoteContestIds,
        isOnlyOneReport,
      };
    }
  }

  // Check for the privacy risk of reports with low ballot counts
  for (const cardCounts of allCardCounts) {
    const ballotCount = getBallotCount(cardCounts);
    if (isLowBallotCountPrivacyRisk(ballotCount)) {
      return {
        type: 'privacy',
        subType: 'low-ballot-count',
        isOnlyOneReport,
      };
    }
  }

  return { type: 'none' };
}

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

import { Optional } from '@votingworks/basics';
import { Tabulation } from '@votingworks/types';
import { getScannedBallotCount } from '@votingworks/utils';
import pluralize from 'pluralize';

export type PrivacyWarningStatus =
  | {
      type: 'none';
    }
  | {
      type: 'low-ballot-count';
      scannedBallotCount: number;
      isSingleReport: boolean;
    };

function isBallotCountPrivacyRisk(scannedBallotCount: number): boolean {
  return (
    scannedBallotCount > 0 &&
    scannedBallotCount < Tabulation.TALLY_REPORT_PRIVACY_THRESHOLD
  );
}

export function getPrivacyWarningStatus(
  allCardCounts: Tabulation.GroupList<Tabulation.CardCounts>
): PrivacyWarningStatus {
  for (const cardCounts of allCardCounts) {
    const scannedBallotCount = getScannedBallotCount(cardCounts);
    if (isBallotCountPrivacyRisk(scannedBallotCount)) {
      return {
        type: 'low-ballot-count',
        scannedBallotCount,
        isSingleReport: allCardCounts.length === 1,
      };
    }
  }

  return { type: 'none' };
}

export function getPrivacyWarningText(
  privacyWarningStatus: PrivacyWarningStatus
): Optional<string> {
  if (privacyWarningStatus.type === 'low-ballot-count') {
    const { scannedBallotCount, isSingleReport } = privacyWarningStatus;

    if (isSingleReport) {
      return `The currently specified tally report contains only ${pluralize(
        'scanned ballot',
        scannedBallotCount,
        true
      )}, which may be a voter privacy risk.`;
    }
    return `A section of the currently specified tally report contains fewer than ${Tabulation.TALLY_REPORT_PRIVACY_THRESHOLD} scanned ballots, which may be a voter privacy risk.`;
  }
}

import { find } from '@votingworks/basics';
import {
  Election,
  getPartyForBallotStyle,
  Tabulation,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';

export type LabeledScannerBatch = Tabulation.ScannerBatch & { label: string };

// VxScan and VxCentralScan produce batch labels of the form 'Batch 1',
// 'Batch 2', etc., so we don't need to prefix them with 'Batch'.
export function getBatchLabel(
  batchId: string,
  scannerBatches: LabeledScannerBatch[]
): string {
  return batchId === Tabulation.MANUAL_BATCH_ID
    ? 'Manual Tallies'
    : find(scannerBatches, (batch) => batch.batchId === batchId).label;
}

export function getScannerLabel(scannerId: string): string {
  return scannerId === Tabulation.MANUAL_SCANNER_ID
    ? 'Manual Tallies'
    : scannerId;
}

export function getBallotStyleLabel(
  election: Election,
  ballotStyleGroupId: string
): string {
  const ballotStyleGroups = getGroupedBallotStyles(election.ballotStyles);
  const ballotStyleGroup = find(
    ballotStyleGroups,
    (group) => group.id === ballotStyleGroupId
  );
  let districtsToShow = ballotStyleGroup.districts;
  if (ballotStyleGroup.districts.length > 1) {
    const districtsSharedByAllBallotStyles = new Set(
      election.districts
        .filter((district) =>
          ballotStyleGroups.every((bs) => bs.districts.includes(district.id))
        )
        .map((district) => district.id)
    );
    districtsToShow = ballotStyleGroup.districts.filter(
      (districtId) => !districtsSharedByAllBallotStyles.has(districtId)
    );
  }
  const districts = districtsToShow
    .map(
      (districtId) =>
        find(election.districts, (district) => district.id === districtId).name
    )
    .join(', ');
  const party = getPartyForBallotStyle({
    election,
    ballotStyleId: ballotStyleGroup.defaultLanguageBallotStyle.id,
  })?.name;
  return [districts, party].filter(Boolean).join(' - ');
}

export function prefixedTitle({
  isOfficial,
  isForLogicAndAccuracyTesting,
  title,
}: {
  isOfficial?: boolean;
  isForLogicAndAccuracyTesting?: boolean;
  title: string;
}): string {
  let prefix = '';
  if (isForLogicAndAccuracyTesting) {
    prefix = 'Test Deck';
  } else {
    prefix = isOfficial ? 'Official' : 'Unofficial';
  }

  return `${prefix} ${title}`;
}

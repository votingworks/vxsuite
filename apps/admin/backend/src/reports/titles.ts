import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  Result,
  assertDefined,
  err,
  find,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  getDistrictById,
  getPartyById,
  getPrecinctById,
} from '@votingworks/utils';
import { ScannerBatch } from '../types';

const MANUAL_BATCH_REPORT_LABEL = 'Manual Tallies';

/**
 * Checks whether the report has any filters which have multiple values selected.
 */
function isCompoundFilter(filter: Admin.FrontendReportingFilter): boolean {
  return Boolean(
    (filter.partyIds && filter.partyIds.length > 1) ||
      (filter.ballotStyleGroupIds && filter.ballotStyleGroupIds.length > 1) ||
      (filter.precinctIds && filter.precinctIds.length > 1) ||
      (filter.batchIds && filter.batchIds.length > 1) ||
      (filter.scannerIds && filter.scannerIds.length > 1) ||
      (filter.votingMethods && filter.votingMethods.length > 1) ||
      (filter.adjudicationFlags && filter.adjudicationFlags.length > 1) ||
      (filter.districtIds && filter.districtIds.length > 1)
  );
}

/**
 * Returns the number of dimensions being filtered on.
 */
function getFilterRank(filter: Admin.FrontendReportingFilter): number {
  return (
    (filter.ballotStyleGroupIds?.[0] ? 1 : 0) +
    (filter.precinctIds?.[0] ? 1 : 0) +
    (filter.batchIds?.[0] ? 1 : 0) +
    (filter.scannerIds?.[0] ? 1 : 0) +
    (filter.votingMethods?.[0] ? 1 : 0) +
    (filter.partyIds?.[0] ? 1 : 0) +
    (filter.adjudicationFlags?.[0] ? 1 : 0) +
    (filter.districtIds?.[0] ? 1 : 0)
  );
}

/**
 * Attempts to generate a title for an individual report based on its filter.
 */
export function generateTitleForReport({
  filter,
  electionDefinition,
  scannerBatches,
  reportType,
}: {
  filter: Admin.FrontendReportingFilter;
  electionDefinition: ElectionDefinition;
  scannerBatches: ScannerBatch[];
  reportType: 'Tally' | 'Ballot Count';
}): Result<string, 'title-not-supported'> {
  const baseTitle = `${reportType} Report`;
  const reportRank = getFilterRank(filter);

  // Full election reports
  if (reportRank === 0) {
    return ok(baseTitle);
  }

  if (isCompoundFilter(filter) || reportRank > 1) {
    return err('title-not-supported');
  }

  const ballotStyleGroupId = filter.ballotStyleGroupIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const votingMethod = filter.votingMethods?.[0];
  const batchId = filter.batchIds?.[0];
  const scannerId = filter.scannerIds?.[0];
  const partyId = filter.partyIds?.[0];
  const adjudicationFlag = filter.adjudicationFlags?.[0];
  const districtId = filter.districtIds?.[0];

  const reportSuffix = (() => {
    if (precinctId) {
      return getPrecinctById(electionDefinition, precinctId).name;
    }

    if (ballotStyleGroupId) {
      return `Ballot Style ${ballotStyleGroupId}`;
    }

    if (votingMethod) {
      return `${Tabulation.VOTING_METHOD_LABELS[votingMethod]} Ballots`;
    }

    if (batchId) {
      if (batchId === Tabulation.MANUAL_BATCH_ID) {
        return MANUAL_BATCH_REPORT_LABEL;
      }

      const { scannerId: resolvedScannerId, label: batchLabel } = find(
        scannerBatches,
        (b) => b.batchId === batchId
      );

      // VxScan and VxCentralScan produce batch labels of the form 'Batch 1',
      // 'Batch 2', etc., so we don't need to prefix them with 'Batch'.
      return `Scanner ${resolvedScannerId}, ${batchLabel}`;
    }

    if (scannerId) {
      if (scannerId === Tabulation.MANUAL_SCANNER_ID) {
        return MANUAL_BATCH_REPORT_LABEL;
      }

      return `Scanner ${scannerId}`;
    }

    if (partyId) {
      return getPartyById(electionDefinition, partyId).fullName;
    }

    if (adjudicationFlag) {
      switch (adjudicationFlag) {
        case 'isBlank':
          return 'Blank Ballots';
        case 'hasOvervote':
          return 'Ballots With Overvotes';
        case 'hasUndervote':
          return 'Ballots With Undervotes';
        case 'hasWriteIn':
          return 'Ballots With Write-Ins';
        /* istanbul ignore next */
        default:
          throwIllegalValue(adjudicationFlag);
      }
    }

    if (districtId) {
      return getDistrictById(electionDefinition, districtId).name;
    }
  })();

  return ok(`${baseTitle} • ${assertDefined(reportSuffix)}`);
}

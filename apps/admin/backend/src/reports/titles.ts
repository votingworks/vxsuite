import { Admin, ElectionDefinition, Tabulation } from '@votingworks/types';
import {
  Optional,
  Result,
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

const MANUAL_BATCH_REPORT_LABEL = 'Manual Batch';

function getBatchLabel(batchId: string): string {
  return `Batch ${batchId.slice(0, Tabulation.BATCH_ID_DISPLAY_LENGTH)}`;
}

/**
 * Checks whether the report has any filters which have multiple values selected.
 */
function isCompoundFilter(filter: Admin.FrontendReportingFilter): boolean {
  return Boolean(
    (filter.partyIds && filter.partyIds.length > 1) ||
      (filter.ballotStyleIds && filter.ballotStyleIds.length > 1) ||
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
    (filter.ballotStyleIds?.[0] ? 1 : 0) +
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
  reportType = 'Tally',
}: {
  filter: Admin.FrontendReportingFilter;
  electionDefinition: ElectionDefinition;
  scannerBatches: ScannerBatch[];
  reportType?: 'Tally' | 'Ballot Count';
}): Result<Optional<string>, 'title-not-supported'> {
  if (isCompoundFilter(filter)) {
    return err('title-not-supported');
  }

  const ballotStyleId = filter.ballotStyleIds?.[0];
  const precinctId = filter.precinctIds?.[0];
  const votingMethod = filter.votingMethods?.[0];
  const batchId = filter.batchIds?.[0];
  const scannerId = filter.scannerIds?.[0];
  const partyId = filter.partyIds?.[0];
  const adjudicationFlag = filter.adjudicationFlags?.[0];
  const districtId = filter.districtIds?.[0];

  const reportRank = getFilterRank(filter);

  // Full Election Tally Report
  if (reportRank === 0) {
    return ok(undefined);
  }

  if (reportRank === 1) {
    if (precinctId) {
      return ok(
        `${
          getPrecinctById(electionDefinition, precinctId).name
        } ${reportType} Report`
      );
    }

    if (ballotStyleId) {
      return ok(`Ballot Style ${ballotStyleId} ${reportType} Report`);
    }

    if (votingMethod) {
      return ok(
        `${Tabulation.VOTING_METHOD_LABELS[votingMethod]} Ballot ${reportType} Report`
      );
    }

    if (batchId) {
      if (batchId === Tabulation.MANUAL_BATCH_ID) {
        return ok(`${MANUAL_BATCH_REPORT_LABEL} ${reportType} Report`);
      }

      const { scannerId: resolvedScannerId } = find(
        scannerBatches,
        (b) => b.batchId === batchId
      );

      return ok(
        `Scanner ${resolvedScannerId} ${getBatchLabel(
          batchId
        )} ${reportType} Report`
      );
    }

    if (scannerId) {
      if (scannerId === Tabulation.MANUAL_SCANNER_ID) {
        return ok(`${MANUAL_BATCH_REPORT_LABEL} ${reportType} Report`);
      }

      return ok(`Scanner ${scannerId} ${reportType} Report`);
    }

    if (partyId) {
      return ok(
        `${
          getPartyById(electionDefinition, partyId).fullName
        } ${reportType} Report`
      );
    }

    if (adjudicationFlag) {
      switch (adjudicationFlag) {
        case 'isBlank':
          return ok(`Blank ${reportType} Report`);
        case 'hasOvervote':
          return ok(`Overvoted ${reportType} Report`);
        case 'hasUndervote':
          return ok(`Undervoted ${reportType} Report`);
        case 'hasWriteIn':
          return ok(`Write-In ${reportType} Report`);
        /* istanbul ignore next */
        default:
          throwIllegalValue(adjudicationFlag);
      }
    }

    if (districtId) {
      return ok(
        `${
          getDistrictById(electionDefinition, districtId).name
        } ${reportType} Report`
      );
    }
  }

  if (reportRank === 2) {
    // Party + Other
    if (partyId) {
      const partyFullName = getPartyById(electionDefinition, partyId).fullName;
      if (precinctId) {
        return ok(
          `${partyFullName} ${
            getPrecinctById(electionDefinition, precinctId).name
          } ${reportType} Report`
        );
      }

      if (votingMethod) {
        return ok(
          `${partyFullName} ${Tabulation.VOTING_METHOD_LABELS[votingMethod]} Ballot ${reportType} Report`
        );
      }

      if (ballotStyleId) {
        return ok(
          `${partyFullName} Ballot Style ${ballotStyleId} ${reportType} Report`
        );
      }
    }

    // Ballot Style + Other
    if (ballotStyleId) {
      if (precinctId) {
        return ok(
          `Ballot Style ${ballotStyleId} ${
            getPrecinctById(electionDefinition, precinctId).name
          } ${reportType} Report`
        );
      }

      if (votingMethod) {
        return ok(
          `Ballot Style ${ballotStyleId} ${Tabulation.VOTING_METHOD_LABELS[votingMethod]} Ballot ${reportType} Report`
        );
      }
    }

    // Precinct + Other
    if (precinctId) {
      if (votingMethod) {
        return ok(
          `${getPrecinctById(electionDefinition, precinctId).name} ${
            Tabulation.VOTING_METHOD_LABELS[votingMethod]
          } Ballot ${reportType} Report`
        );
      }

      if (scannerId) {
        return ok(
          `${
            getPrecinctById(electionDefinition, precinctId).name
          } Scanner ${scannerId} ${reportType} Report`
        );
      }
    }

    // Other Combinations

    if (votingMethod && districtId) {
      return ok(
        `${getDistrictById(electionDefinition, districtId).name} ${
          Tabulation.VOTING_METHOD_LABELS[votingMethod]
        } Ballot ${reportType} Report`
      );
    }

    if (scannerId && batchId) {
      if (batchId === Tabulation.MANUAL_BATCH_ID) {
        return ok(`${MANUAL_BATCH_REPORT_LABEL} ${reportType} Report`);
      }

      return ok(
        `Scanner ${scannerId} ${getBatchLabel(batchId)} ${reportType} Report`
      );
    }
  }

  return err('title-not-supported');
}

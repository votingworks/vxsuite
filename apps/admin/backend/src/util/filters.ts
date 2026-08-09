import {
  Admin,
  Election,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { ScannerBatch } from '../types.js';

/**
 * Intersects two lists of values. The second list is optional; when it is
 * omitted, the first list is returned unchanged.
 */
function intersect<T>(values: T[], otherValues?: T[]): T[] {
  return otherValues
    ? values.filter((value) => otherValues.includes(value))
    : values;
}

/**
 * Reduces the higher-level dimensions the frontend filter interface offers
 * into the lower-level cast vote record dimensions that tabulation can query
 * on, intersecting with any filter the user already placed on those lower-level
 * dimensions.
 *
 * District has a many-to-many relationship with ballot styles, so district
 * filters reduce to ballot style filters.
 *
 * Polling place is not an attribute of a cast vote record at all, but of the
 * batch it was scanned in, so polling place filters reduce to the batches
 * attributed to those polling places, plus the precincts those polling places
 * cover. The precinct component is redundant for selecting cast vote records -
 * every ballot in those batches is necessarily from one of those precincts -
 * but it will be used later on in the reporting pipeline to filter the list of
 * contests that appear in the report.
 */
export function convertFrontendFilter(
  frontendFilter: Admin.FrontendReportingFilter,
  election: Election,
  scannerBatches: ScannerBatch[]
): Admin.ReportingFilter {
  const { districtIds, pollingPlaceIds, ...rest } = frontendFilter;
  let filter: Admin.ReportingFilter = rest;

  if (districtIds) {
    const districtBallotStyleGroupIds = getGroupedBallotStyles(
      election.ballotStyles
    )
      .filter((bs) =>
        bs.districts.some((districtId) => districtIds.includes(districtId))
      )
      .map((bs) => bs.id);

    filter = {
      ...filter,
      ballotStyleGroupIds: intersect(
        districtBallotStyleGroupIds,
        filter.ballotStyleGroupIds
      ),
    };
  }

  if (pollingPlaceIds) {
    const pollingPlaceBatchIds = scannerBatches
      .filter(
        (batch) =>
          batch.pollingPlaceId !== undefined &&
          pollingPlaceIds.includes(batch.pollingPlaceId)
      )
      .map((batch) => batch.batchId);

    // A polling place that covers only some splits of a precinct still
    // contributes the whole precinct here, so its report may list contests
    // that only the precinct's other splits vote on. We accept that
    // imprecision rather than reducing to ballot styles.
    const pollingPlacePrecinctIdList = pollingPlaceIds.flatMap(
      (pollingPlaceId) => [
        ...pollingPlacePrecinctIds(
          pollingPlaceFromElection(election, pollingPlaceId)
        ),
      ]
    );

    filter = {
      ...filter,
      batchIds: intersect(pollingPlaceBatchIds, filter.batchIds),
      precinctIds: intersect(pollingPlacePrecinctIdList, filter.precinctIds),
    };
  }

  return filter;
}

/**
 * Confirm that filter doesn't contain dimensions which should have been pre-processed.
 */
export function assertIsBackendFilter(filter?: Admin.ReportingFilter): void {
  if (filter && 'districtIds' in filter) {
    throw new Error(
      'filter contains unused dimension "districtIds" - does that need to be converted to ballotStyleIds?'
    );
  }

  if (filter && 'pollingPlaceIds' in filter) {
    throw new Error(
      'filter contains unused dimension "pollingPlaceIds" - does that need to be converted to batchIds?'
    );
  }
}

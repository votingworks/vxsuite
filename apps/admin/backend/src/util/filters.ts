import {
  Admin,
  Election,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { ScannerBatch } from '../types.js';

/**
 * Narrows an existing filter dimension to the values implied by a
 * higher-level frontend filter. If the dimension wasn't already filtered on,
 * the implied values become the filter.
 */
function intersect<T>(existing: T[] | undefined, implied: T[]): T[] {
  return existing
    ? existing.filter((value) => implied.includes(value))
    : implied;
}

/**
 * The frontend filter interface allows filtering on geographical district,
 * which has a many-to-many relationship with ballot styles. In this helper,
 * we reduce the district filters into ballot style filters.
 *
 * It also allows filtering on polling place, which is not an attribute of a
 * cast vote record but of the batch it was scanned in. We reduce it to the
 * batches attributed to those polling places, plus the precincts those polling
 * places cover. The precinct component is redundant for selecting cast vote
 * records - every ballot in those batches is necessarily from one of those
 * precincts - but it scopes the contests and expected groups of the report,
 * which are derived from the election definition rather than from the cast
 * vote records.
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
        filter.ballotStyleGroupIds,
        districtBallotStyleGroupIds
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

    const pollingPlacePrecinctIdList = pollingPlaceIds.flatMap(
      (pollingPlaceId) => [
        ...pollingPlacePrecinctIds(
          pollingPlaceFromElection(election, pollingPlaceId)
        ),
      ]
    );

    filter = {
      ...filter,
      batchIds: intersect(filter.batchIds, pollingPlaceBatchIds),
      precinctIds: intersect(filter.precinctIds, pollingPlacePrecinctIdList),
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

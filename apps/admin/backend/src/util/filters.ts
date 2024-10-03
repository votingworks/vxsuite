import { Admin, Election } from '@votingworks/types';

/**
 * The frontend filter interface allows filtering on geographical district,
 * which has a many-to-many relationship with ballot styles. In this helper,
 * we reduce the district filters into ballot style filters.
 */
export function convertFrontendFilter(
  frontendFilter: Admin.FrontendReportingFilter,
  election: Election
): Admin.ReportingFilter {
  const { districtIds, ...rest } = frontendFilter;
  if (!districtIds) return rest;

  const districtBallotStyleIds = election.ballotStyles
    .filter((bs) =>
      bs.districts.some((districtId) => districtIds.includes(districtId))
    )
    .map((bs) => bs.id);

  // the new filter should be the intersection of the district-based ballot styles
  // and the pre-existing list of ballot styles, if one exists
  const ballotStyleIds = rest.ballotStyleGroupIds
    ? rest.ballotStyleGroupIds.filter((id) => districtBallotStyleIds.includes(id))
    : districtBallotStyleIds;

  return {
    ...rest,
    ballotStyleGroupIds: ballotStyleIds,
  };
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
}

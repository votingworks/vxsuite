import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import { Admin } from '@votingworks/api';

import { ServicesContext } from '../contexts/services_context';

/**
 * Gets the query key for {@link useCvrFilesQuery}.
 */
export function getCvrsQueryKey(): QueryKey {
  return ['cvrs'];
}

/**
 * Returns a metadata query for all imported CVR files, if any, for the current
 * election.
 */
export function useCvrFilesQuery(): UseQueryResult<
  Admin.CastVoteRecordFileRecord[]
> {
  const { backend } = useContext(ServicesContext);
  return useQuery(getCvrsQueryKey(), () => backend.getCvrs());
}

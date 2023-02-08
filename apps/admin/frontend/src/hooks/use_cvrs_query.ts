import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import { CastVoteRecord } from '@votingworks/types';

import { ServicesContext } from '../contexts/services_context';

/**
 * Gets the query key for {@link useCvrsQuery}.
 */
export function getCvrsQueryKey(): QueryKey {
  return ['cvrs'];
}

/**
 * Returns a query for all CVRs imported for the current election.
 */
export function useCvrsQuery(): UseQueryResult<CastVoteRecord[]> {
  const { backend } = useContext(ServicesContext);
  return useQuery(getCvrsQueryKey(), () => backend.getCvrs());
}

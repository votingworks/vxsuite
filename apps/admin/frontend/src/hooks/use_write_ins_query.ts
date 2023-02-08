import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { ContestId } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface Props {
  readonly contestId?: ContestId;
  readonly status?: Admin.WriteInAdjudicationStatus;
  readonly enabled?: boolean;
}

export type WriteInsQuery = UseQueryResult<Admin.WriteInRecord[]>;

/**
 * Gets the query key for the write-ins query.
 */
export function getWriteInsQueryKey(props?: Props): QueryKey {
  return props ? ['write-ins', props] : ['write-ins'];
}

/**
 * Returns a query for all write-ins matching the given criteria.
 */
export function useWriteInsQuery({
  contestId,
  status,
  enabled = true,
}: Props = {}): WriteInsQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(
    getWriteInsQueryKey({ contestId, status }),
    () => backend.loadWriteIns({ contestId, status }),
    { enabled }
  );
}

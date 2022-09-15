import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { ContestId } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface Props {
  readonly contestId?: ContestId;
}

export type WriteInSummaryQuery = UseQueryResult<Admin.WriteInSummaryEntry[]>;

/**
 * Gets the query key for the write-in summary query.
 */
export function getWriteInSummaryQueryKey({ contestId }: Props = {}): QueryKey {
  return contestId ? ['write-in-summary', contestId] : ['write-in-summary'];
}

/**
 * Provides access to the write-in summary.
 */
export function useWriteInSummaryQuery({
  contestId,
}: Props = {}): WriteInSummaryQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(getWriteInSummaryQueryKey({ contestId }), () => {
    return backend.getWriteInSummary({ contestId });
  });
}

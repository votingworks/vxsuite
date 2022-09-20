import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { ContestId } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface Props {
  readonly contestId: ContestId;
}

export type WriteInAdjudicationTableQuery =
  UseQueryResult<Admin.WriteInAdjudicationTable>;

/**
 * Gets the query key for the write-in adjudication table query.
 */
export function getWriteInAdjudicationTableQueryKey({
  contestId,
}: Partial<Props> = {}): QueryKey {
  return contestId
    ? ['write-in-adjudication-table', contestId]
    : ['write-in-adjudication-table'];
}

/**
 * Provides access to the write-in adjudication table query.
 */
export function useWriteInAdjudicationTableQuery({
  contestId,
}: Props): WriteInAdjudicationTableQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(getWriteInAdjudicationTableQueryKey({ contestId }), () =>
    backend.getWriteInAdjudicationTable(contestId)
  );
}

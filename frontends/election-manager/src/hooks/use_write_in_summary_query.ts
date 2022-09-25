import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { ContestId } from '@votingworks/types';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

export interface Props<
  Status extends Admin.WriteInAdjudicationStatus = Admin.WriteInAdjudicationStatus
> {
  readonly contestId?: ContestId;
  readonly status?: Status;
}

export type WriteInSummaryQuery<
  Entry extends Admin.WriteInSummaryEntry = Admin.WriteInSummaryEntry
> = UseQueryResult<Entry[]>;

/**
 * Gets the query key for the write-in summary query.
 */
export function getWriteInSummaryQueryKey({ contestId }: Props = {}): QueryKey {
  return contestId ? ['write-in-summary', contestId] : ['write-in-summary'];
}

/**
 * Provides access to the write-in summary.
 */
export function useWriteInSummaryQuery(): WriteInSummaryQuery;

/**
 * Provides access to the write-in summary for write-ins pending transcription.
 */
export function useWriteInSummaryQuery({
  contestId,
  status,
}: Props<'pending'>): WriteInSummaryQuery<Admin.WriteInSummaryEntryPendingTranscription>;

/**
 * Provides access to the write-in summary for transcribed write-ins.
 */
export function useWriteInSummaryQuery({
  contestId,
  status,
}: Props<'transcribed'>): WriteInSummaryQuery<Admin.WriteInSummaryEntryTranscribed>;

/**
 * Provides access to the write-in summary for adjudicated write-ins.
 */
export function useWriteInSummaryQuery({
  contestId,
  status,
}: Props<'adjudicated'>): WriteInSummaryQuery<Admin.WriteInSummaryEntryAdjudicated>;

/**
 * Provides access to the write-in summary.
 */
export function useWriteInSummaryQuery({
  contestId,
}: Props): WriteInSummaryQuery;

/**
 * Provides access to the write-in summary.
 */
export function useWriteInSummaryQuery({
  contestId,
  status,
}: Props = {}): WriteInSummaryQuery {
  const { backend } = useContext(ServicesContext);

  return useQuery(getWriteInSummaryQueryKey({ contestId, status }), () =>
    backend.getWriteInSummary({ contestId, status })
  );
}

import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { useContext } from 'react';
import { ServicesContext } from '../contexts/services_context';

/**
 * Returns the query key for the current election metadata.
 */
export function getCurrentElectionMetadataResultsQueryKey(): QueryKey {
  return ['election-metadata', 'current'];
}

/**
 * Returns a query for the current election metadata.
 */
export function useCurrentElectionMetadata(): UseQueryResult<Admin.ElectionRecord> {
  const { backend } = useContext(ServicesContext);

  return useQuery(
    getCurrentElectionMetadataResultsQueryKey(),
    async () => (await backend.loadCurrentElectionMetadata()) ?? null
  );
}

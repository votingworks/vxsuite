import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import { Admin } from '@votingworks/api';

import { ServicesContext } from '../contexts/services_context';

/**
 * Gets the query key for the CVR file mode query.
 */
export function getCvrFileModeQueryKey(): QueryKey {
  return ['cvr-file-mode'];
}

/**
 * Returns a query for the current CVR file mode, if any, for the current election.
 */
export function useCvrFileModeQuery(): UseQueryResult<Admin.CvrFileMode> {
  const { backend } = useContext(ServicesContext);

  return useQuery(getCvrFileModeQueryKey(), () =>
    backend.getCurrentCvrFileMode()
  );
}

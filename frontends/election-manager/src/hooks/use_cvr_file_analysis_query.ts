import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { Admin } from '@votingworks/api';
import { useContext } from 'react';

import { ServicesContext } from '../contexts/services_context';

/** Gets the query key for the CVR file analysis query. */
export function getCvrFileAnalysisQueryKey(cvrFile: File): QueryKey {
  return ['cvr-file-analysis', cvrFile.name, cvrFile.lastModified];
}

/** Returns a query for an analysis of the given CVR file. */
export function useCvrFileAnalysisQuery(
  cvrFile: File
): UseQueryResult<Admin.CvrFileImportInfo> {
  const { backend } = useContext(ServicesContext);

  return useQuery(getCvrFileAnalysisQueryKey(cvrFile), () =>
    backend.addCastVoteRecordFile(cvrFile, { analyzeOnly: true })
  );
}

import { QueryKey, useQuery, UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import { ServicesContext } from '../contexts/services_context';
import { AddCastVoteRecordFileResult } from '../lib/backends';

/** Gets the query key for the CVR file analysis query. */
export function getCvrFileAnalysisQueryKey(cvrFile: File): QueryKey {
  return ['cvr-file-analysis', cvrFile.name, cvrFile.lastModified];
}

/** Returns a query for an analysis of the the given CVR file. */
export function useCvrFileAnalysisQuery(
  cvrFile: File
): UseQueryResult<AddCastVoteRecordFileResult> {
  const { backend } = useContext(ServicesContext);

  return useQuery(getCvrFileAnalysisQueryKey(cvrFile), () =>
    backend.addCastVoteRecordFile(cvrFile, { analyzeOnly: true })
  );
}

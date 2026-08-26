import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getCastVoteRecordsDataVersion,
  invalidateCastVoteRecordDerivedQueries,
} from '../api.js';

/**
 * Refreshes cast-vote-record-derived data when it changes on the server
 * without a frontend mutation — i.e. when a networked scanner's batch import
 * lands. Polls the (trivially cheap) CVR data version and invalidates the
 * derived queries when it moves. Renders nothing.
 */
export function CvrDataRefresher(): null {
  const queryClient = useQueryClient();
  const versionQuery = getCastVoteRecordsDataVersion.usePollingQuery();
  const version = versionQuery.data;
  const seenVersion = useRef<number>();

  useEffect(() => {
    if (version === undefined) return;
    if (seenVersion.current !== undefined && version !== seenVersion.current) {
      void invalidateCastVoteRecordDerivedQueries(queryClient);
    }
    seenVersion.current = version;
  }, [version, queryClient]);

  return null;
}

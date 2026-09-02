import { useQueryClient } from '@tanstack/react-query';
import { useQueryChangeListener } from '@votingworks/ui';
import {
  getCastVoteRecordsDataVersion,
  invalidateCastVoteRecordDerivedQueries,
} from '../api.js';

/**
 * Refreshes cast-vote-record-derived data when it changes on the server
 * without a frontend mutation - i.e. when a networked scanner's batch import
 * lands. Polls the (trivially cheap) CVR data version and invalidates the
 * derived queries when it moves. Renders nothing.
 */
export function CvrDataRefresher(): null {
  const queryClient = useQueryClient();
  const versionQuery = getCastVoteRecordsDataVersion.usePollingQuery();

  useQueryChangeListener(versionQuery, {
    onChange: (_newVersion, previousVersion) => {
      // On the first observed version there is nothing to refresh yet
      if (previousVersion !== undefined) {
        void invalidateCastVoteRecordDerivedQueries(queryClient);
      }
    },
  });

  return null;
}

import {
  getCurrentInProgressElection,
  getElectionPackageRenderingStatus,
} from '../api.js';

/**
 * Keeps polling a running election package build from any screen, so VxAdmin
 * picks up the election the build configures it with when it finishes. Renders
 * nothing.
 */
export function ElectionPackageRenderingRefresher(): null {
  const electionInfo = getCurrentInProgressElection.useQuery().data;
  getElectionPackageRenderingStatus.usePollingQuery(electionInfo?.electionId);
  return null;
}

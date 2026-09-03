import { throwIllegalValue } from '@votingworks/basics';
import type { NetworkConnectionInfo } from '@votingworks/central-scan-backend';
import {
  NetworkIndicatorStatus,
  NetworkStatusIndicator as NetworkStatusIndicatorView,
} from '@votingworks/ui';
import { getNetworkStatus } from '../api.js';

function indicatorStatus(
  connection: NetworkConnectionInfo
): NetworkIndicatorStatus {
  const { status } = connection;
  switch (status) {
    // For results-official and invalid-mode, VxAdmin is reachable but won't
    // take this machine's batches; the Scan Ballots screen explains why, so
    // the connection itself reads as fine.
    case 'online-host-detected':
    case 'online-results-official':
    case 'online-invalid-mode':
      return 'connected';
    case 'offline':
      return 'no-network';
    case 'online-waiting-for-host':
    case 'online-machine-unconfigured':
    case 'online-host-unconfigured':
    case 'online-ballot-hash-mismatch':
      return 'no-host-connected';
    case 'online-multiple-hosts-detected':
    case 'online-code-version-mismatch':
      return 'error';
    default:
      return throwIllegalValue(status);
  }
}

export function NetworkStatusIndicator(): JSX.Element | null {
  const networkStatusQuery = getNetworkStatus.usePollingQuery();
  if (!networkStatusQuery.isSuccess || !networkStatusQuery.data.isEnabled) {
    return null;
  }

  return (
    <NetworkStatusIndicatorView
      status={indicatorStatus(networkStatusQuery.data.connection)}
    />
  );
}

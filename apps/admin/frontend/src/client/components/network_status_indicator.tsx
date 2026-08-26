import { throwIllegalValue } from '@votingworks/basics';
import type { NetworkConnectionStatus } from '@votingworks/admin-backend';
import {
  NetworkIndicatorStatus,
  NetworkStatusIndicator as NetworkStatusIndicatorView,
} from '@votingworks/ui';
import { getNetworkConnectionStatus } from '../api.js';

function indicatorStatus(
  connection: NetworkConnectionStatus
): NetworkIndicatorStatus {
  const { status } = connection;
  switch (status) {
    case 'online-connected-to-host':
      return 'connected';
    case 'offline':
      return 'no-network';
    case 'online-waiting-for-host':
      return 'no-host-connected';
    case 'online-multiple-hosts-detected':
    case 'online-incompatible-host-version':
      return 'error';
    // istanbul ignore next -- compile-time check
    default:
      return throwIllegalValue(status);
  }
}

/**
 * Toolbar network status indicator for adjudication stations, using the same
 * status buckets as VxCentralScan's indicator.
 */
export function ClientNetworkStatusIndicator(): JSX.Element | null {
  const networkStatusQuery = getNetworkConnectionStatus.usePollingQuery();
  if (!networkStatusQuery.isSuccess) return null;

  return (
    <NetworkStatusIndicatorView
      status={indicatorStatus(networkStatusQuery.data)}
    />
  );
}

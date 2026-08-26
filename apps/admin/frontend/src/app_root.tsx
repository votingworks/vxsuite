import { DippedSmartCardAuth } from '@votingworks/types';
import { AUTH_STATUS_POLLING_INTERVAL_MS } from '@votingworks/ui';
import { AppContext } from './contexts/app_context.js';
import { AppRoutes } from './components/app_routes.js';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getNetworkStatus,
} from './api.js';
import { useWatchUsbDriveStatus } from './hooks/use_watch_usb_drive_status.js';
import { DEFAULT_QUERY_REFETCH_INTERVAL } from './utils/globals.js';

export function AppRoot(): JSX.Element | null {
  // AppRoot is the single poller for these queries. Other components
  // subscribe with `useQuery()` and no `refetchInterval`, receiving updates
  // through the shared query cache; react-query runs a separate refetch timer
  // for every observer that sets one, so a second poller would multiply the
  // request rate to the backend.
  const authStatusQuery = getAuthStatus.useQuery({
    refetchInterval: AUTH_STATUS_POLLING_INTERVAL_MS,
  });
  getNetworkStatus.useQuery({
    refetchInterval: DEFAULT_QUERY_REFETCH_INTERVAL,
  });
  const usbDriveStatusQuery = useWatchUsbDriveStatus();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();

  if (
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess
  ) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;
  const machineConfig = getMachineConfigQuery.data;
  const auth: DippedSmartCardAuth.AuthStatus = authStatusQuery.data;
  const {
    electionDefinition,
    electionPackageHash,
    isOfficialResults = false,
    createdAt: configuredAt,
  } = currentElectionMetadataQuery.data ?? {};

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        electionPackageHash,
        configuredAt,
        isOfficialResults,
        usbDriveStatus,
        auth,
        machineConfig,
        machineMode: 'host',
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}

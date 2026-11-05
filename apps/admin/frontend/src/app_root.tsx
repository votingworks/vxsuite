import type { DippedSmartCardAuth } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { AppContext } from './contexts/app_context.js';
import { AppRoutes } from './components/app_routes.js';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  isElectionDefinitionEnabled,
} from './api.js';
import { useWatchUsbDriveStatus } from './hooks/use_watch_usb_drive_status.js';

export function AppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.usePollingQuery();
  const usbDriveStatusQuery = useWatchUsbDriveStatus();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();
  const isElectionDefinitionFlagEnabled = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_ELECTION_DESIGN
  );
  const isElectionDefinitionEnabledQuery = isElectionDefinitionEnabled.useQuery(
    {
      enabled: isElectionDefinitionFlagEnabled,
    }
  );

  if (
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess ||
    (isElectionDefinitionFlagEnabled &&
      !isElectionDefinitionEnabledQuery.isSuccess)
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
        isElectionDefinitionEnabled:
          isElectionDefinitionFlagEnabled &&
          isElectionDefinitionEnabledQuery.data === true,
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}

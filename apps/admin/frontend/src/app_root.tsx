import { AppContext } from './contexts/app_context';
import { AppRoutes } from './components/app_routes';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getUsbDriveStatus,
} from './api';

export function AppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
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
  const auth = authStatusQuery.data;
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
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}

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

  const electionDefinition =
    currentElectionMetadataQuery.data?.electionDefinition;

  if (
    !authStatusQuery.isSuccess ||
    !usbDriveStatusQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess
  ) {
    return null;
  }

  const usbDriveStatus = usbDriveStatusQuery.data;

  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        configuredAt: currentElectionMetadataQuery.data?.createdAt,
        isOfficialResults:
          currentElectionMetadataQuery.data?.isOfficialResults ?? false,
        usbDriveStatus,
        auth: authStatusQuery.data,
        machineConfig: getMachineConfigQuery.data,
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}

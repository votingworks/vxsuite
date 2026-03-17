import { DippedSmartCardAuth } from '@votingworks/types';
import { AppContext } from './contexts/app_context';
import { AppRoutes } from './components/app_routes';
import {
  getAuthStatus,
  getCurrentElectionMetadata,
  getMachineConfig,
  getUsbDrives,
} from './api';

export function AppRoot(): JSX.Element | null {
  const authStatusQuery = getAuthStatus.useQuery();
  const usbDrivesQuery = getUsbDrives.useQuery();
  const getMachineConfigQuery = getMachineConfig.useQuery();
  const currentElectionMetadataQuery = getCurrentElectionMetadata.useQuery();

  if (
    !authStatusQuery.isSuccess ||
    !usbDrivesQuery.isSuccess ||
    !getMachineConfigQuery.isSuccess ||
    !currentElectionMetadataQuery.isSuccess
  ) {
    return null;
  }

  const usbDrives = usbDrivesQuery.data;
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
        usbDrives,
        auth,
        machineConfig,
      }}
    >
      <AppRoutes />
    </AppContext.Provider>
  );
}

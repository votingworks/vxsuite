import {
  UnconfiguredElectionScreen,
  Main,
  Screen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { configureElectionPackageFromUsb, getUsbDriveStatus } from './api';

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with calls to the VxPrint backend
 */
export function UnconfiguredElectionScreenWrapper(): JSX.Element | null {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const configure = configureElectionPackageFromUsb.useMutation();

  useQueryChangeListener(usbDriveStatusQuery, {
    onChange: (newUsbDriveStatus) => {
      if (newUsbDriveStatus.status === 'mounted') {
        configure.mutate();
      }
    },
  });

  if (!usbDriveStatusQuery.isSuccess) {
    return null;
  }

  const backendError = configure.data?.err();
  return (
    <Screen>
      <Main centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth
          backendConfigError={backendError}
          machineName="VxPrint"
        />
      </Main>
    </Screen>
  );
}

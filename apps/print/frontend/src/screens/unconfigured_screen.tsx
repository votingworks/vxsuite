import {
  UnconfiguredElectionScreen,
  Main,
  Screen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { configureElectionPackageFromUsb, getUsbDriveStatus } from '../api';

export function UnconfiguredScreen({
  isElectionManagerAuth,
}: {
  isElectionManagerAuth: boolean;
}): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const configure = configureElectionPackageFromUsb.useMutation();

  useQueryChangeListener(usbDriveStatusQuery, {
    onChange: (newUsbDriveStatus) => {
      if (newUsbDriveStatus.status === 'mounted') {
        configure.mutate();
      }
    },
  });

  const backendError = configure.data?.err();
  return (
    <Screen>
      <Main centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data || { status: 'no_drive' }}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={backendError}
          machineName="VxPrint"
        />
      </Main>
    </Screen>
  );
}

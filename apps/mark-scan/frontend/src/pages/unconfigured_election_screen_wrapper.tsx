import {
  UnconfiguredElectionScreen,
  Main,
  Screen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { configureElectionPackageFromUsb, getUsbDriveStatus } from '../api';

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxMarkScan-specific logic (primarily calls to the VxMarkScan backend)
 */
export function UnconfiguredElectionScreenWrapper(): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  // USB drive status is guaranteed to exist because app root will not render
  // this component until the USB drive query succeeds.
  assert(usbDriveStatusQuery.isSuccess);

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
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth
          backendConfigError={backendError}
          machineName="VxMark"
        />
      </Main>
    </Screen>
  );
}

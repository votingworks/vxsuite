import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { configureElectionPackageFromUsb, getUsbDriveStatus } from '../api';
import { ScreenWrapper } from '../components/screen_wrapper';

export function UnconfiguredElectionManagerScreen(): JSX.Element | null {
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
    <ScreenWrapper authType="election_manager" centerChild>
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveStatusQuery.data}
        isElectionManagerAuth
        backendConfigError={backendError}
        machineName="VxPrint"
      />
    </ScreenWrapper>
  );
}

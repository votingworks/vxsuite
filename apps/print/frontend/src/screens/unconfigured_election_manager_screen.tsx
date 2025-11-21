import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { configureElectionPackageFromUsb, getDeviceStatuses } from '../api';
import { ScreenWrapper } from '../components/screen_wrapper';

export function UnconfiguredElectionManagerScreen(): JSX.Element | null {
  const deviceStatusesQuery = getDeviceStatuses.useQuery();
  const configure = configureElectionPackageFromUsb.useMutation();

  useQueryChangeListener(deviceStatusesQuery, {
    onChange: (newDeviceStatuses, previousDeviceStatuses) => {
      if (
        newDeviceStatuses.usbDrive?.status === 'mounted' &&
        previousDeviceStatuses?.usbDrive?.status !== 'mounted'
      ) {
        configure.mutate();
      }
    },
  });

  if (!deviceStatusesQuery.isSuccess) {
    return null;
  }

  const { usbDrive } = deviceStatusesQuery.data;

  const backendError = configure.data?.err();
  return (
    <ScreenWrapper authType="election_manager" centerChild>
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDrive}
        isElectionManagerAuth
        backendConfigError={backendError}
        machineName="VxPrint"
      />
    </ScreenWrapper>
  );
}

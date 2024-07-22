import { UnconfiguredElectionScreen, Screen, Main } from '@votingworks/ui';
import { useEffect } from 'react';
import {
  configureFromElectionPackageOnUsbDrive,
  getUsbDriveStatus,
} from '../api';

interface Props {
  isElectionManagerAuth: boolean;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxScan-specific logic (primarily calls to the VxScan API)
 */
export function UnconfiguredElectionScreenWrapper(
  props: Props
): JSX.Element | null {
  const { isElectionManagerAuth } = props;

  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const configureMutation =
    configureFromElectionPackageOnUsbDrive.useMutation();
  // TODO move watching for USB drive to configure to the backend
  useEffect(() => {
    if (
      usbDriveStatusQuery.isSuccess &&
      usbDriveStatusQuery.data.status === 'mounted'
    ) {
      configureMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    configureMutation.mutate,
    usbDriveStatusQuery.isSuccess,
    usbDriveStatusQuery.data?.status,
  ]);

  const error = configureMutation.data?.err();

  if (!usbDriveStatusQuery.isSuccess) return null;

  return (
    <Screen>
      <Main padded centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxScan"
        />
      </Main>
    </Screen>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredElectionScreenWrapper isElectionManagerAuth />;
}

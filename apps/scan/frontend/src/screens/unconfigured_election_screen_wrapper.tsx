import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';
import {
  configureFromBallotPackageOnUsbDrive,
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
  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();
  // TODO move watching for USB drive to configure to the backend
  useQueryChangeListener(
    usbDriveStatusQuery,
    ({ status }) => status,
    (newUsbDriveStatus) => {
      if (newUsbDriveStatus === 'mounted') {
        configureMutation.mutate();
      }
    }
  );
  const error = configureMutation.data?.err();

  if (!usbDriveStatusQuery.isSuccess) return null;

  return (
    <ScreenMainCenterChild>
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveStatusQuery.data}
        isElectionManagerAuth={isElectionManagerAuth}
        backendConfigError={error}
        machineName="VxScan"
      />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredElectionScreenWrapper isElectionManagerAuth />;
}

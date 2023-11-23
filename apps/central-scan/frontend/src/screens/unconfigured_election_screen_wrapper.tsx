import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import {
  configureFromBallotPackageOnUsbDrive,
  getUsbDriveStatus,
} from '../api';
import { NavigationScreen } from '../navigation_screen';

interface Props {
  isElectionManagerAuth: boolean;
}

export function UnconfiguredElectionScreenWrapper({
  isElectionManagerAuth,
}: Props): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  // USB drive status is guaranteed to exist because app root will not render
  // this component until the USB drive query succeeds.
  assert(usbDriveStatusQuery.isSuccess);

  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();

  useQueryChangeListener(usbDriveStatusQuery, (newUsbDriveStatus) => {
    if (newUsbDriveStatus.status === 'mounted') {
      configureMutation.mutate();
    }
  });

  const error = configureMutation.data?.err();

  return (
    <NavigationScreen>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxCentralScan"
        />
      </div>
    </NavigationScreen>
  );
}

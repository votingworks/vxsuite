import {
  Button,
  Main,
  Screen,
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { MainNav } from '../components/main_nav';
import {
  configureFromBallotPackageOnUsbDrive,
  getUsbDriveStatus,
  legacyUsbDriveStatus,
  logOut,
} from '../api';

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

  const logOutMutation = logOut.useMutation();
  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();

  useQueryChangeListener(usbDriveStatusQuery, (newUsbDriveStatus) => {
    if (newUsbDriveStatus.status === 'mounted') {
      configureMutation.mutate();
    }
  });

  const error = configureMutation.data?.err();

  return (
    <Screen>
      <MainNav>
        <Button small onPress={() => logOutMutation.mutate()}>
          Lock Machine
        </Button>
      </MainNav>
      <Main centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={legacyUsbDriveStatus(usbDriveStatusQuery.data)}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxCentralScan"
        />
      </Main>
    </Screen>
  );
}

import {
  Button,
  Main,
  Screen,
  UnconfiguredElectionScreen,
  UsbDriveStatus,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { MainNav } from '../components/main_nav';
import { configureFromBallotPackageOnUsbDrive, logOut } from '../api';

interface Props {
  isElectionManagerAuth: boolean;
  usbDriveStatus: UsbDriveStatus;
}

export function UnconfiguredElectionScreenWrapper({
  isElectionManagerAuth,
  usbDriveStatus,
}: Props): JSX.Element {
  const logOutMutation = logOut.useMutation();
  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();

  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
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
          usbDriveStatus={usbDriveStatus}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxCentralScan"
        />
      </Main>
    </Screen>
  );
}

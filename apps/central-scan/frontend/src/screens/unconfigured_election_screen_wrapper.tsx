import {
  Button,
  Main,
  Screen,
  UnconfiguredElectionScreen,
  UsbDriveStatus,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { MainNav } from '../components/main_nav';
import {
  configureFromBallotPackageOnUsbDrive,
  logOut,
  switchToAdmin,
} from '../api';

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
  const switchToAdminMutation = switchToAdmin.useMutation();

  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
      configureMutation.mutate();
    }
  });

  const error = configureMutation.data?.err();

  return (
    <Screen>
      <MainNav>
        <Button
          onPress={() => {
            switchToAdminMutation.mutate();
            window.kiosk?.quit();
          }}
        >
          ⇌VxAdmin
        </Button>{' '}
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

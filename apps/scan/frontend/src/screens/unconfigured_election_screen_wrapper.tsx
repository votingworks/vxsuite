import {
  UnconfiguredElectionScreen,
  Screen,
  Main,
  useQueryChangeListener,
} from '@votingworks/ui';
import {
  configureFromElectionPackageOnUsbDrive,
  getUsbDriveStatus,
} from '../api.js';

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

  useQueryChangeListener(usbDriveStatusQuery, {
    select: ({ status }) => status,
    onChange: (newStatus) => {
      if (newStatus === 'mounted') {
        configureMutation.mutate();
      }
    },
  });

  const error = configureMutation.data?.err();

  // @coverage-defer
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

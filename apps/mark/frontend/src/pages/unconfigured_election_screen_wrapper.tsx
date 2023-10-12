import {
  UnconfiguredElectionScreen,
  Main,
  Screen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { ElectionDefinition } from '@votingworks/types';
import { assert } from '@votingworks/basics';
import { configureBallotPackageFromUsb, getUsbDriveStatus } from '../api';

interface Props {
  updateElectionDefinition: (electionDefinition: ElectionDefinition) => void;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxMark-specific logic (primarily calls to the VxMark backend)
 */
export function UnconfiguredElectionScreenWrapper(props: Props): JSX.Element {
  const { updateElectionDefinition } = props;
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  // USB drive status is guaranteed to exist because app root will not render
  // this component until the USB drive query succeeds.
  assert(usbDriveStatusQuery.isSuccess);
  const configureMutation = configureBallotPackageFromUsb.useMutation();

  useQueryChangeListener(usbDriveStatusQuery, (newUsbDriveStatus) => {
    if (newUsbDriveStatus.status === 'mounted') {
      // Errors are passed to and handled by UnconfiguredElectionScreen
      void configureMutation.mutateAsync().then((result) => {
        if (result.isOk()) {
          updateElectionDefinition(result.ok());
        }
      });
    }
  });

  const backendError = configureMutation.data?.err();
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

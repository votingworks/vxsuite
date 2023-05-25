import React from 'react';

import {
  UnconfiguredElectionScreen,
  UsbDriveStatus,
  Main,
  Screen,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { configureBallotPackageFromUsb } from '../api';

interface Props {
  usbDriveStatus: UsbDriveStatus;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxMark-specific logic (primarily calls to the VxMark backend)
 */
export function UnconfiguredElectionScreenWrapper(props: Props): JSX.Element {
  const { usbDriveStatus } = props;
  const configureMutation = configureBallotPackageFromUsb.useMutation();

  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
      // Errors are passed to and handled by UnconfiguredElectionScreen
      configureMutation.mutate();
    }
  });

  const backendError = configureMutation.data?.err();
  return (
    <Screen>
      <Main centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatus}
          isElectionManagerAuth
          backendConfigError={backendError}
          machineName="VxMark"
        />
      </Main>
    </Screen>
  );
}

import React from 'react';

import {
  UnconfiguredElectionScreen,
  UsbDriveStatus,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { ElectionDefinition } from '@votingworks/types';
import { configureBallotPackageFromUsb } from '../api';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  updateElectionDefinition: (electionDefinition: ElectionDefinition) => void;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxMark-specific logic (primarily calls to the VxMark backend)
 */
export function UnconfiguredElectionScreenWrapper(props: Props): JSX.Element {
  const { updateElectionDefinition, usbDriveStatus } = props;
  const configureMutation = configureBallotPackageFromUsb.useMutation();

  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
      // Errors are passed to and handled by UnconfiguredElectionScreen
      void configureMutation.mutateAsync().then((result) => {
        if (result.isOk()) {
          updateElectionDefinition(result.ok());
        }
      });
    }
  });

  const backendError = configureMutation?.data?.err();
  return (
    <UnconfiguredElectionScreen
      usbDriveStatus={usbDriveStatus}
      isElectionManagerAuth
      backendConfigError={backendError}
      machineName="VxMark"
    />
  );
}

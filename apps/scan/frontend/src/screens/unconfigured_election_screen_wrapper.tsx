import React from 'react';
import {
  UnconfiguredElectionScreen,
  UsbDriveStatus,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import { ScreenMainCenterChild } from '../components/layout';
import { configureFromBallotPackageOnUsbDrive } from '../api';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  isElectionManagerAuth: boolean;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxScan-specific logic (primarily calls to the VxScan API)
 */
export function UnconfiguredElectionScreenWrapper(props: Props): JSX.Element {
  const { usbDriveStatus, isElectionManagerAuth } = props;

  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();
  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
      configureMutation.mutate();
    }
  });
  const error = configureMutation.data?.err();

  return (
    <ScreenMainCenterChild>
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveStatus}
        isElectionManagerAuth={isElectionManagerAuth}
        backendConfigError={error}
        machineName="VxScan"
      />
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return (
    <UnconfiguredElectionScreenWrapper
      usbDriveStatus="absent"
      isElectionManagerAuth
    />
  );
}

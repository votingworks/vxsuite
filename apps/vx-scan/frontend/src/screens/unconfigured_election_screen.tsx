import React from 'react';
import { throwIllegalValue } from '@votingworks/utils';
import {
  UsbDriveStatus,
  useExternalStateChangeListener,
} from '@votingworks/ui';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { IndeterminateProgressBar } from '../components/graphics';
import { configureFromBallotPackageOnUsbDrive } from '../api';

interface Props {
  usbDriveStatus: UsbDriveStatus;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
}: Props): JSX.Element {
  const configureMutation = configureFromBallotPackageOnUsbDrive.useMutation();

  useExternalStateChangeListener(usbDriveStatus, (newUsbDriveStatus) => {
    if (newUsbDriveStatus === 'mounted') {
      configureMutation.mutate();
    }
  });

  const errorMessage = (() => {
    if (usbDriveStatus !== 'mounted') {
      return 'Insert a USB drive containing a ballot package.';
    }
    const error = configureMutation.data?.err();
    if (!error) return undefined;
    switch (error) {
      case 'no_ballot_package_on_usb_drive':
        return 'No ballot package found on the inserted USB drive.';
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(error);
    }
  })();

  return (
    <ScreenMainCenterChild infoBar={false}>
      {errorMessage ? (
        <CenteredLargeProse>
          <h1>VxScan is not configured</h1>
          <p>{errorMessage}</p>
        </CenteredLargeProse>
      ) : (
        <CenteredLargeProse>
          <h1>Configuring VxScan from USB drive…</h1>
          <IndeterminateProgressBar />
        </CenteredLargeProse>
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredElectionScreen usbDriveStatus="absent" />;
}

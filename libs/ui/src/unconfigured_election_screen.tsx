import React from 'react';
import { ConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { UsbDriveStatus } from './hooks/use_usb_drive';
import { IndeterminateProgressBar } from './graphics';
import { CenteredLargeProse } from './centered_large_prose';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  backendConfigError?: ConfigurationError;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  backendConfigError,
}: Props): JSX.Element {
  const errorMessage = (() => {
    if (usbDriveStatus !== 'mounted') {
      return 'Insert a USB drive containing a ballot package.';
    }

    if (!backendConfigError) {
      return undefined;
    }
    switch (backendConfigError) {
      case 'no_ballot_package_on_usb_drive':
        return 'No ballot package found on the inserted USB drive.';
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(backendConfigError);
    }
  })();

  if (errorMessage) {
    return (
      <CenteredLargeProse>
        <h1>VxScan is not configured</h1>
        <p>{errorMessage}</p>
      </CenteredLargeProse>
    );
  }

  return (
    <CenteredLargeProse>
      <h1>Configuring VxScan from USB drive…</h1>
      <IndeterminateProgressBar />
    </CenteredLargeProse>
  );
}

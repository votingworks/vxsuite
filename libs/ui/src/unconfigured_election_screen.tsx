import React from 'react';
import { BallotPackageConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { UsbDriveStatus } from './hooks/use_usb_drive';
import { IndeterminateProgressBar } from './graphics';
import { CenteredLargeProse } from './centered_large_prose';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  backendConfigError?: BallotPackageConfigurationError;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  backendConfigError,
}: Props): JSX.Element {
  const errorMessage = (() => {
    // TODO make user role checks here and return a better error message
    if (usbDriveStatus !== 'mounted') {
      return 'Insert a USB drive containing a ballot package.';
    }

    if (!backendConfigError) {
      return undefined;
    }

    switch (backendConfigError) {
      case 'no_ballot_package_on_usb_drive':
        return 'No ballot package found on the inserted USB drive.';
      case 'auth_required_before_ballot_package_load':
      case 'user_role_not_allowed':
        // TODO make these auth checks before prompting for USB drive. This may require
        // a separate backend handler
        return 'Insert an election manager card before loading a ballot package.';
      case 'election_hash_mismatch':
        return 'The most recent ballot package found is for a different election.';
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

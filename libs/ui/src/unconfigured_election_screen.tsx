import React from 'react';
import { BallotPackageConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import { UsbDriveStatus } from './hooks/use_usb_drive';
import { IndeterminateProgressBar } from './graphics';
import { CenteredLargeProse } from './centered_large_prose';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  isElectionManagerAuth: boolean;
  backendConfigError?: BallotPackageConfigurationError;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  isElectionManagerAuth,
  backendConfigError,
}: Props): JSX.Element {
  const errorMessage = (() => {
    if (!isElectionManagerAuth) {
      return 'Only election managers can configure VxScan.';
    }

    if (usbDriveStatus !== 'mounted') {
      return 'Insert a USB drive containing a ballot package.';
    }

    if (!backendConfigError) {
      return undefined;
    }

    switch (backendConfigError) {
      case 'no_ballot_package_on_usb_drive':
        return 'No ballot package found on the inserted USB drive.';
      // The frontend should prevent auth_required_before_ballot_package_load
      // but we enforce it for redundancy
      case 'auth_required_before_ballot_package_load':
        return 'Please insert an election manager card before configuring.';
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

import { BallotPackageConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { LoadingAnimation } from './loading_animation';
import { Font, H1, H3 } from './typography';

export interface UnconfiguredElectionScreenProps {
  usbDriveStatus: UsbDriveStatus;
  isElectionManagerAuth: boolean;
  backendConfigError?: BallotPackageConfigurationError;
  machineName: 'VxScan' | 'VxMark' | 'VxCentralScan' | 'VxMarkScan';
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  isElectionManagerAuth,
  backendConfigError,
  machineName,
}: UnconfiguredElectionScreenProps): JSX.Element {
  const errorMessage = (() => {
    if (!isElectionManagerAuth) {
      return `Only election managers can configure ${machineName}.`;
    }

    if (usbDriveStatus.status !== 'mounted') {
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
      case 'ballot_package_authentication_error':
        return 'Error authenticating ballot package. Try exporting it from VxAdmin again.';
      case 'election_hash_mismatch':
        return 'The most recent ballot package found is for a different election.';
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(backendConfigError);
    }
  })();

  if (errorMessage) {
    return (
      <Font align="center">
        <H1>{machineName} is Not Configured</H1>
        <H3 style={{ fontWeight: 'normal' }}>{errorMessage}</H3>
      </Font>
    );
  }

  return (
    <Font align="center">
      <H1>Configuring {machineName} from USB drive…</H1>
      <LoadingAnimation />
    </Font>
  );
}

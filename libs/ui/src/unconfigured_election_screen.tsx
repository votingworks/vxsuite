import { BallotPackageConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { CenteredLargeProse } from './centered_large_prose';
import { LoadingAnimation } from './loading_animation';
import { H1, P } from './typography';

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
  const [errorMessageBig, errorMessageSmall] = (() => {
    if (!isElectionManagerAuth) {
      return [
        'Use the Election Manager card instead',
        `Only election managers can configure ${machineName}.`,
      ];
    }

    if (usbDriveStatus.status !== 'mounted') {
      return ['Insert a USB drive containing a ballot package', ''];
    }

    if (!backendConfigError) {
      return [undefined, undefined];
    }

    const bigMessage = `${machineName} is Not Configured`;

    switch (backendConfigError) {
      case 'no_ballot_package_on_usb_drive':
        return [
          bigMessage,
          'No ballot package found on the inserted USB drive.',
        ];
      // The frontend should prevent auth_required_before_ballot_package_load
      // but we enforce it for redundancy
      case 'auth_required_before_ballot_package_load':
        return [
          bigMessage,
          'Please insert an election manager card before configuring.',
        ];
      case 'ballot_package_authentication_error':
        return [
          bigMessage,
          'Error authenticating ballot package. Try exporting it from VxAdmin again.',
        ];
      case 'election_hash_mismatch':
        return [
          bigMessage,
          'The most recent ballot package found is for a different election.',
        ];
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(backendConfigError);
    }
  })();

  if (errorMessageBig) {
    return (
      <CenteredLargeProse>
        <H1>{errorMessageBig}</H1>
        <P>{errorMessageSmall}</P>
      </CenteredLargeProse>
    );
  }

  return (
    <CenteredLargeProse>
      <H1>Configuring {machineName} from USB drive…</H1>
      <LoadingAnimation />
    </CenteredLargeProse>
  );
}

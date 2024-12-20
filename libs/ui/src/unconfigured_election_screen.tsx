import { ElectionPackageConfigurationError } from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/basics';
import type { UsbDriveStatus } from '@votingworks/usb-drive';
import { FullScreenIconWrapper, Icons } from './icons';
import { UsbDriveImage } from './usb_drive_image';
import { FullScreenMessage } from './full_screen_message';

export interface UnconfiguredElectionScreenProps {
  usbDriveStatus: UsbDriveStatus;
  isElectionManagerAuth: boolean;
  backendConfigError?: ElectionPackageConfigurationError;
  machineName: 'VxScan' | 'VxMark' | 'VxCentralScan';
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  isElectionManagerAuth,
  backendConfigError,
  machineName,
}: UnconfiguredElectionScreenProps): JSX.Element {
  if (usbDriveStatus.status !== 'mounted') {
    return (
      <FullScreenMessage
        title="Insert a USB drive containing an election package"
        image={<UsbDriveImage />}
      />
    );
  }

  const errorMessage = (() => {
    if (!isElectionManagerAuth) {
      return `Only election managers can configure ${machineName}.`;
    }

    if (!backendConfigError) {
      return undefined;
    }

    switch (backendConfigError) {
      case 'no_election_package_on_usb_drive':
        return 'No election package found on the inserted USB drive.';
      // The frontend should prevent auth_required_before_election_package_load
      // but we enforce it for redundancy
      case 'auth_required_before_election_package_load':
        return 'Insert an election manager card before configuring.';
      case 'election_package_authentication_error':
        return 'Error authenticating election package. Try exporting it from VxAdmin again.';
      case 'election_key_mismatch':
        return 'The most recent election package found is for a different election.';
      /* istanbul ignore next - compile time check for completeness */
      default:
        throwIllegalValue(backendConfigError);
    }
  })();

  if (errorMessage) {
    return (
      <FullScreenMessage
        title={`Failed to configure ${machineName}`}
        image={
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        }
      >
        {errorMessage}
      </FullScreenMessage>
    );
  }

  return (
    <FullScreenMessage
      title={`Configuring ${machineName} from USB drive…`}
      image={
        <FullScreenIconWrapper>
          <Icons.Loading />
        </FullScreenIconWrapper>
      }
    />
  );
}

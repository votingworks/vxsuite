import React from 'react';
import { throwIllegalValue } from '@votingworks/basics';
import {
  H1,
  H2,
  LoadingAnimation,
  P,
  Section,
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
      <Section horizontalAlign="center">
        {errorMessage ? (
          <React.Fragment>
            <H1>VxScan is not configured</H1>
            <P>{errorMessage}</P>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <H1>Configuring VxScan from USB drive…</H1>
            <H1 aria-hidden>
              <LoadingAnimation />
            </H1>
          </React.Fragment>
        )}
      </Section>
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredElectionScreen usbDriveStatus="absent" />;
}

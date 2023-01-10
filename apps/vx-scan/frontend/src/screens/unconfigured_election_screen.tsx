import React, { useState } from 'react';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { ConfigurationError } from '@votingworks/vx-scan-backend';
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
import { useApiClient } from '../api/api';

interface Props {
  usbDriveStatus: UsbDriveStatus;
  refreshConfig: () => Promise<void>;
}

export function UnconfiguredElectionScreen({
  usbDriveStatus,
  refreshConfig,
}: Props): JSX.Element {
  const apiClient = useApiClient();
  const [error, setError] = useState<ConfigurationError>();

  useExternalStateChangeListener(usbDriveStatus, async (newUsbDriveStatus) => {
    setError(undefined);
    if (newUsbDriveStatus !== 'mounted') return;
    const result = await apiClient.configureFromBallotPackageOnUsbDrive();
    if (result.isErr()) {
      setError(result.err());
      return;
    }
    await refreshConfig();
  });

  const errorMessage = (() => {
    if (usbDriveStatus !== 'mounted') {
      return 'Insert a USB drive containing a ballot package.';
    }
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
  return (
    <UnconfiguredElectionScreen
      usbDriveStatus="absent"
      refreshConfig={() => Promise.resolve()}
    />
  );
}

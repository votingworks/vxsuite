import React, { useState } from 'react';
import useInterval from 'use-interval';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { UsbDriveBallotPackageError } from '@votingworks/vx-scan-backend';
import { Result } from '@votingworks/types';
import { POLLING_INTERVAL_FOR_USB } from '../config/globals';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { IndeterminateProgressBar } from '../components/graphics';
import { useApiClient } from '../api/api';

interface Props {
  refreshConfig: () => Promise<void>;
}

export function UnconfiguredElectionScreen({
  refreshConfig,
}: Props): JSX.Element {
  const apiClient = useApiClient();
  const [ballotPackageResult, setBallotPackageResult] =
    useState<Result<void, UsbDriveBallotPackageError>>();

  // Repeatedly attempt to configure from USB drive until it succeeds, at which
  // point we can refresh the config and this screen will be unmounted.
  useInterval(async () => {
    try {
      const newBallotPackageResult =
        await apiClient.checkForBallotPackageOnUsbDrive();
      setBallotPackageResult(newBallotPackageResult);
      if (newBallotPackageResult.isOk()) {
        await apiClient.configureFromBallotPackageOnUsbDrive();
        await refreshConfig();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }, POLLING_INTERVAL_FOR_USB);

  const errorMessage = !ballotPackageResult
    ? 'Checking for USB drives…'
    : ballotPackageResult.isErr() &&
      {
        no_usb_drive_connected:
          'Insert a USB drive containing a ballot package.',
        no_ballot_package_on_usb_drive:
          'No ballot package found on the inserted USB drive.',
      }[ballotPackageResult.err()];

  return (
    <ScreenMainCenterChild infoBar={false}>
      {ballotPackageResult?.isOk() ? (
        <CenteredLargeProse>
          <h1>Configuring VxScan from USB drive…</h1>
          <IndeterminateProgressBar />
        </CenteredLargeProse>
      ) : (
        <CenteredLargeProse>
          <h1>VxScan is not configured</h1>
          <p>{errorMessage}</p>
        </CenteredLargeProse>
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return <UnconfiguredElectionScreen refreshConfig={() => Promise.resolve()} />;
}

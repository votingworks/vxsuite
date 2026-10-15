import { useState } from 'react';
import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert, type Result } from '@votingworks/basics';
import type {
  ElectionDefinition,
  ElectionPackageConfigurationError,
} from '@votingworks/types';
import {
  configureFromElectionPackageOnUsbDrive,
  getUsbDriveStatus,
} from '../api.js';
import { NavigationScreen } from '../navigation_screen.js';

interface Props {
  isElectionManagerAuth: boolean;
}

export function UnconfiguredElectionScreenWrapper({
  isElectionManagerAuth,
}: Props): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.usePollingQuery();
  // USB drive status is guaranteed to exist because app root will not render
  // this component until the USB drive query succeeds.
  assert(usbDriveStatusQuery.isSuccess);

  const configureMutation =
    configureFromElectionPackageOnUsbDrive.useMutation();
  const [configureResult, setConfigureResult] =
    useState<Result<ElectionDefinition, ElectionPackageConfigurationError>>();

  useQueryChangeListener(usbDriveStatusQuery, {
    select: ({ status }) => status,
    onChange: async (newStatus) => {
      if (newStatus !== 'mounted') return;
      setConfigureResult(undefined);
      setConfigureResult(await configureMutation.mutateAsync());
    },
  });

  const error = configureResult?.err();

  return (
    <NavigationScreen>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxCentralScan"
        />
      </div>
    </NavigationScreen>
  );
}

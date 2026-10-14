import { useState } from 'react';
import {
  UnconfiguredElectionScreen,
  Main,
  Screen,
  useQueryChangeListener,
} from '@votingworks/ui';
import { assert, type Result } from '@votingworks/basics';
import type {
  ElectionDefinition,
  ElectionPackageConfigurationError,
} from '@votingworks/types';
import { configureElectionPackageFromUsb, getUsbDriveStatus } from '../api.js';

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxMark-specific logic (primarily calls to the VxMark backend)
 */
export function UnconfiguredElectionScreenWrapper(): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  // USB drive status is guaranteed to exist because app root will not render
  // this component until the USB drive query succeeds.
  assert(usbDriveStatusQuery.isSuccess);
  const configure = configureElectionPackageFromUsb.useMutation();
  const [configureResult, setConfigureResult] =
    useState<Result<ElectionDefinition, ElectionPackageConfigurationError>>();

  useQueryChangeListener(usbDriveStatusQuery, {
    select: ({ status }) => status,
    onChange: async (newStatus) => {
      if (newStatus !== 'mounted') return;
      setConfigureResult(undefined);
      setConfigureResult(await configure.mutateAsync());
    },
  });

  const backendError = configureResult?.err();
  return (
    <Screen>
      <Main centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth
          backendConfigError={backendError}
          machineName="VxMark"
        />
      </Main>
    </Screen>
  );
}

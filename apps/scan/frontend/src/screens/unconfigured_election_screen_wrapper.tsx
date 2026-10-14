import { useState } from 'react';
import {
  UnconfiguredElectionScreen,
  Screen,
  Main,
  useQueryChangeListener,
} from '@votingworks/ui';
import type { Result } from '@votingworks/basics';
import type { ElectionPackageConfigurationError } from '@votingworks/types';
import {
  configureFromElectionPackageOnUsbDrive,
  getUsbDriveStatus,
} from '../api.js';

interface Props {
  isElectionManagerAuth: boolean;
}

/**
 * UnconfiguredElectionScreenWrapper wraps the shared UnconfiguredElectionScreen component
 * with VxScan-specific logic (primarily calls to the VxScan API)
 */
export function UnconfiguredElectionScreenWrapper(
  props: Props
): JSX.Element | null {
  const { isElectionManagerAuth } = props;

  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const configureMutation =
    configureFromElectionPackageOnUsbDrive.useMutation();
  const [configureResult, setConfigureResult] =
    useState<Result<void, ElectionPackageConfigurationError>>();

  useQueryChangeListener(usbDriveStatusQuery, {
    select: ({ status }) => isElectionManagerAuth && status === 'mounted',
    onChange: async (shouldConfigure) => {
      if (!shouldConfigure) return;
      setConfigureResult(undefined);
      setConfigureResult(await configureMutation.mutateAsync());
    },
  });

  const error = configureResult?.err();

  // @coverage-defer
  if (!usbDriveStatusQuery.isSuccess) return null;

  return (
    <Screen>
      <Main padded centerChild>
        <UnconfiguredElectionScreen
          usbDriveStatus={usbDriveStatusQuery.data}
          isElectionManagerAuth={isElectionManagerAuth}
          backendConfigError={error}
          machineName="VxScan"
        />
      </Main>
    </Screen>
  );
}

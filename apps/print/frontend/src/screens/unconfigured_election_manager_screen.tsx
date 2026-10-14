import { useState } from 'react';
import {
  UnconfiguredElectionScreen,
  useQueryChangeListener,
} from '@votingworks/ui';
import type { Result } from '@votingworks/basics';
import type {
  ElectionDefinition,
  ElectionPackageConfigurationError,
} from '@votingworks/types';
import { configureElectionPackageFromUsb, getDeviceStatuses } from '../api.js';
import { ScreenWrapper } from '../components/screen_wrapper.js';

export function UnconfiguredElectionManagerScreen(): JSX.Element | null {
  const deviceStatusesQuery = getDeviceStatuses.useQuery();
  const configure = configureElectionPackageFromUsb.useMutation();
  const [configureResult, setConfigureResult] =
    useState<Result<ElectionDefinition, ElectionPackageConfigurationError>>();

  useQueryChangeListener(deviceStatusesQuery, {
    select: ({ usbDrive }) => usbDrive.status,
    onChange: async (usbDriveStatus) => {
      if (usbDriveStatus !== 'mounted') return;
      setConfigureResult(undefined);
      setConfigureResult(await configure.mutateAsync());
    },
  });

  if (!deviceStatusesQuery.isSuccess) {
    return null;
  }

  const { usbDrive } = deviceStatusesQuery.data;

  const backendError = configureResult?.err();
  return (
    <ScreenWrapper authType="election_manager" centerChild>
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDrive}
        isElectionManagerAuth
        backendConfigError={backendError}
        machineName="VxPrint"
      />
    </ScreenWrapper>
  );
}

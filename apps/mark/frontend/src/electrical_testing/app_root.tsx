/* istanbul ignore file - @preserve */
import {
  CpuMetricsDisplay,
  ElectricalTestingScreen,
  Icons,
  InputControls,
} from '@votingworks/ui';
import React, { useState } from 'react';
import useInterval from 'use-interval';
import {
  getCpuMetrics,
  getElectricalTestingStatuses,
  setCardReaderTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { useSound } from '../hooks/use_sound';

const SOUND_INTERVAL_SECONDS = 5;

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const getCpuMetricsQuery = getCpuMetrics.useQuery();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const powerDownMutation = systemCallApi.powerDown.useMutation();

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success-5s');

  function toggleCardReaderTaskRunning() {
    setCardReaderTaskRunningMutation.mutate(
      getElectricalTestingStatusesQuery.data?.card?.taskStatus === 'paused'
    );
  }

  function toggleUsbDriveTaskRunning() {
    setUsbDriveTaskRunningMutation.mutate(
      getElectricalTestingStatusesQuery.data?.usbDrive?.taskStatus === 'paused'
    );
  }

  function toggleSoundEnabled() {
    setIsSoundEnabled((prev) => !prev);
  }

  function powerDown() {
    powerDownMutation.mutate();
  }

  useInterval(playSound, isSoundEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null);

  const cardStatus = getElectricalTestingStatusesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusesQuery.data?.usbDrive;

  return (
    <React.Fragment>
      <CpuMetricsDisplay
        metrics={getCpuMetricsQuery.data}
        orientation="portrait"
      />
      <ElectricalTestingScreen
        tasks={[
          {
            id: 'card',
            icon: <Icons.SimCard />,
            title: 'Card Reader',
            statusMessage: cardStatus?.statusMessage ?? 'Unknown',
            isRunning: cardStatus?.taskStatus === 'running',
            toggleIsRunning: toggleCardReaderTaskRunning,
            updatedAt: cardStatus?.updatedAt,
          },
          {
            id: 'usbDrive',
            icon: <Icons.UsbDrive />,
            title: 'USB Drive',
            statusMessage: usbDriveStatus?.statusMessage ?? 'Unknown',
            isRunning: usbDriveStatus?.taskStatus === 'running',
            toggleIsRunning: toggleUsbDriveTaskRunning,
            updatedAt: usbDriveStatus?.updatedAt,
          },
          {
            id: 'sound',
            icon: isSoundEnabled ? <Icons.VolumeUp /> : <Icons.VolumeMute />,
            title: 'Sound',
            body: isSoundEnabled ? 'Enabled' : 'Disabled',
            isRunning: isSoundEnabled,
            toggleIsRunning: toggleSoundEnabled,
          },
          {
            id: 'inputs',
            icon: <Icons.Mouse />,
            title: 'Inputs',
            body: <InputControls />,
          },
        ]}
        perRow={1}
        powerDown={powerDown}
        usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
      />
    </React.Fragment>
  );
}

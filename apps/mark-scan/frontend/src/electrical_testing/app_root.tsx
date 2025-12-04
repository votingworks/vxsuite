import { ElectricalTestingScreen, Icons, InputControls } from '@votingworks/ui';
import { useState } from 'react';
import useInterval from 'use-interval';
import {
  getElectricalTestingStatuses,
  setCardReaderTaskRunning,
  setPaperHandlerTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { useSound } from '../hooks/use_sound';

const SOUND_INTERVAL_SECONDS = 5;

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const setPaperHandlerTaskRunningMutation =
    setPaperHandlerTaskRunning.useMutation();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const powerDownMutation = systemCallApi.powerDown.useMutation();

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success-5s');

  function togglePaperHandlerTaskRunning() {
    setPaperHandlerTaskRunningMutation.mutate(
      getElectricalTestingStatusesQuery.data?.paperHandler?.taskStatus ===
        'paused'
    );
  }

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
  const paperHandlerStatus =
    getElectricalTestingStatusesQuery.data?.paperHandler;
  const usbDriveStatus = getElectricalTestingStatusesQuery.data?.usbDrive;

  return (
    <ElectricalTestingScreen
      tasks={[
        {
          id: 'paperHandler',
          icon: <Icons.File />,
          title: 'Paper Handler',
          statusMessage: paperHandlerStatus?.statusMessage ?? 'Unknown',
          isRunning: paperHandlerStatus?.taskStatus === 'running',
          toggleIsRunning: togglePaperHandlerTaskRunning,
          updatedAt: paperHandlerStatus?.updatedAt,
        },
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
          icon: <Icons.Print />,
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
  );
}

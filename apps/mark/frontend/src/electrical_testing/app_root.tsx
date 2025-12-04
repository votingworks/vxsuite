/* istanbul ignore file - @preserve */
import { Button, ElectricalTestingScreen, Icons } from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import {
  getElectricalTestingStatuses,
  setCardReaderTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { useSound } from '../hooks/use_sound';

const SOUND_INTERVAL_SECONDS = 5;

function CounterButton() {
  const [count, setCount] = useState(0);

  return (
    <Button
      onPress={() => setCount((prev) => prev + 1)}
      style={{ transform: 'scale(0.5)' }}
    >
      Tap Count: {count}
    </Button>
  );
}

const Column = styled.div<{ gap?: string }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: ${({ gap = 0 }) => gap};
`;

const Small = styled.span`
  font-size: 0.45rem;
`;

function formatTimestamp(timestamp: DateTime): string {
  return timestamp.toLocal().toFormat('h:mm:ss a MM/dd/yyyy');
}

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const powerDownMutation = systemCallApi.powerDown.useMutation();

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success-5s');
  const [lastKeyPress, setLastKeyPress] = useState<{
    key: string;
    pressedAt: DateTime;
  }>();

  useEffect(() => {
    function handleKeyboardEvent(e: KeyboardEvent) {
      setLastKeyPress({
        key: e.key === ' ' ? 'Space' : e.key,
        pressedAt: DateTime.now(),
      });
    }

    document.addEventListener('keydown', handleKeyboardEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyboardEvent);
    };
  }, []);

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
          body: (
            <Column>
              <CounterButton />

              <Small>
                Last key press:{' '}
                {lastKeyPress ? (
                  <React.Fragment>
                    <code>{lastKeyPress.key}</code> at{' '}
                    {formatTimestamp(lastKeyPress.pressedAt)}
                  </React.Fragment>
                ) : (
                  'n/a'
                )}
              </Small>
            </Column>
          ),
        },
      ]}
      perRow={1}
      powerDown={powerDown}
      usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
    />
  );
}

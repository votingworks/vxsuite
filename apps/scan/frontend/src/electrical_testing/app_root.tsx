import {
  Button,
  Caption,
  ElectricalTestingScreen,
  Icons,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import { useSound } from '../utils/use_sound';
import {
  getElectricalTestingStatuses,
  getLatestScannedSheet,
  setCardReaderTaskRunning,
  setPrinterTaskRunning,
  setScannerTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { SheetImagesModal } from './sheet_images_modal';

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
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatuses.useQuery();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const setPrinterTaskRunningMutation = setPrinterTaskRunning.useMutation();
  const setScannerTaskRunningMutation = setScannerTaskRunning.useMutation();
  const getLatestScannedSheetQuery = getLatestScannedSheet.useQuery();
  const powerDownMutation = systemCallApi.powerDown.useMutation();
  const [isShowingLatestSheet, setIsShowingLatestSheet] = useState(false);

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success');
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
      getElectricalTestingStatusMessagesQuery.data?.card?.taskStatus ===
        'paused'
    );
  }

  function toggleUsbDriveTaskRunning() {
    setUsbDriveTaskRunningMutation.mutate(
      getElectricalTestingStatusMessagesQuery.data?.usbDrive?.taskStatus ===
        'paused'
    );
  }

  function togglePrinterTaskRunning() {
    setPrinterTaskRunningMutation.mutate(
      getElectricalTestingStatusMessagesQuery.data?.printer?.taskStatus ===
        'paused'
    );
  }

  function toggleScannerTaskRunning() {
    setScannerTaskRunningMutation.mutate(
      getElectricalTestingStatusMessagesQuery.data?.scanner?.taskStatus ===
        'paused'
    );
  }

  function toggleSoundEnabled() {
    setIsSoundEnabled((prev) => !prev);
  }

  function powerDown() {
    powerDownMutation.mutate();
  }

  useInterval(playSound, isSoundEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null);

  const cardStatus = getElectricalTestingStatusMessagesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusMessagesQuery.data?.usbDrive;
  const printerStatus = getElectricalTestingStatusMessagesQuery.data?.printer;
  const scannerStatus = getElectricalTestingStatusMessagesQuery.data?.scanner;

  return (
    <ElectricalTestingScreen
      tasks={[
        {
          id: 'scanner',
          icon: <Icons.File />,
          title: 'Scanner',
          body: (
            <React.Fragment>
              <Caption
                style={{
                  flexGrow: 1,
                  overflowWrap: 'anywhere',
                  maxHeight: '2rem',
                  overflow: 'hidden',
                }}
              >
                <Small>{scannerStatus?.statusMessage ?? 'Unknown'}</Small>
              </Caption>
              {getLatestScannedSheetQuery.data && (
                <Button
                  onPress={() => {
                    setIsShowingLatestSheet(true);
                  }}
                  style={{
                    position: 'absolute',
                    right: '0',
                    bottom: '0',
                    transform: 'scale(0.3) translate(100%, 100%)',
                  }}
                >
                  View Latest Sheet
                </Button>
              )}
            </React.Fragment>
          ),
          isRunning: scannerStatus?.taskStatus === 'running',
          toggleIsRunning: toggleScannerTaskRunning,
          updatedAt: scannerStatus?.updatedAt,
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
          id: 'printer',
          icon: <Icons.Print />,
          title: 'Printer',
          statusMessage: printerStatus?.statusMessage ?? 'Unknown',
          isRunning: printerStatus?.taskStatus === 'running',
          toggleIsRunning: togglePrinterTaskRunning,
          updatedAt: printerStatus?.updatedAt,
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
      perRow={3}
      powerDown={powerDown}
      modals={
        isShowingLatestSheet &&
        getLatestScannedSheetQuery.data && (
          <SheetImagesModal
            paths={getLatestScannedSheetQuery.data}
            onClose={() => setIsShowingLatestSheet(false)}
          />
        )
      }
    />
  );
}

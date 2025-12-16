/* istanbul ignore file - @preserve */
import {
  Button,
  CheckboxButton,
  CpuMetricsDisplay,
  ElectricalTestingScreen,
  Icons,
  InputControls,
  useHeadphonesPluggedIn,
} from '@votingworks/ui';
import React, { useRef, useState } from 'react';
import useInterval from 'use-interval';
import styled from 'styled-components';
import {
  getBarcodeStatus,
  getCpuMetrics,
  getElectricalTestingStatuses,
  getPrinterStatus,
  getPrinterTaskStatus,
  playSpeakerSound,
  printTestPage,
  setCardReaderTaskRunning,
  setPrinterTaskRunning,
  setUsbDriveTaskRunning,
  systemCallApi,
} from './api';
import { useSound } from '../hooks/use_sound';

const SOUND_INTERVAL_SECONDS = 5;

function formatPrinterStatus(
  printerStatus: Awaited<ReturnType<typeof getPrinterStatus.useQuery>>['data'],
  taskStatus: Awaited<ReturnType<typeof getPrinterTaskStatus.useQuery>>['data']
): string {
  if (!printerStatus) {
    return 'Unknown';
  }

  if (!printerStatus.connected) {
    return 'Not Connected';
  }

  const status = printerStatus.richStatus?.state ?? 'Connected';
  const taskState =
    taskStatus?.taskStatus === 'running' ? 'Auto-print ON' : 'Auto-print OFF';
  return `${status} (${taskState})`;
}

function formatBarcodeStatus(
  barcodeStatus: Awaited<ReturnType<typeof getBarcodeStatus.useQuery>>['data']
): React.ReactNode {
  if (!barcodeStatus) {
    return 'Unknown';
  }

  if (!barcodeStatus.connected) {
    return 'Not Connected';
  }

  if (barcodeStatus.lastScan) {
    const timestamp = barcodeStatus.lastScanTimestamp
      ? barcodeStatus.lastScanTimestamp.toLocaleTimeString()
      : '';
    return (
      <span>
        Connected
        <br />
        Last scan ({timestamp}):
        <br />
        Data: {barcodeStatus.lastScan.data}
      </span>
    );
  }

  return 'Connected - No scans yet';
}

const AudioControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  transform: scale(0.5);
  transform-origin: top left;
`;

function AudioControls({
  speakerEnabled,
  setSpeakerEnabled,
  headphonesEnabled,
  setHeadphonesEnabled,
  headphonesAvailable,
}: {
  speakerEnabled: boolean;
  setSpeakerEnabled: (enabled: boolean) => void;
  headphonesEnabled: boolean;
  setHeadphonesEnabled: (enabled: boolean) => void;
  headphonesAvailable: boolean;
}): JSX.Element {
  return (
    <AudioControlsContainer>
      <CheckboxButton
        label="Speaker"
        isChecked={speakerEnabled}
        onChange={setSpeakerEnabled}
      />
      <CheckboxButton
        label={
          headphonesAvailable
            ? 'Headphones'
            : 'Headphones (No USB audio detected)'
        }
        isChecked={headphonesEnabled && headphonesAvailable}
        onChange={setHeadphonesEnabled}
        disabled={!headphonesAvailable}
      />
    </AudioControlsContainer>
  );
}

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const getCpuMetricsQuery = getCpuMetrics.useQuery();
  const getPrinterStatusQuery = getPrinterStatus.useQuery();
  const getPrinterTaskStatusQuery = getPrinterTaskStatus.useQuery();
  const getBarcodeStatusQuery = getBarcodeStatus.useQuery();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();
  const setPrinterTaskRunningMutation = setPrinterTaskRunning.useMutation();
  const printTestPageMutation = printTestPage.useMutation();
  const powerDownMutation = systemCallApi.powerDown.useMutation();
  const playSpeakerSoundMutation = playSpeakerSound.useMutation().mutate;

  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true);

  // Track which output to play next for alternating
  const nextOutputRef = useRef<'speaker' | 'headphones'>('speaker');

  // Headphones play through the frontend (USB audio device)
  const playSoundHeadphones = useSound('success-5s');

  const headphonesAvailable = useHeadphonesPluggedIn();

  // Alternating sound playback
  useInterval(
    () => {
      const canPlaySpeaker = speakerEnabled;
      const canPlayHeadphones = headphonesEnabled && headphonesAvailable;

      if (!canPlaySpeaker && !canPlayHeadphones) {
        return;
      }

      // If only one output is available, use that
      if (canPlaySpeaker && !canPlayHeadphones) {
        playSpeakerSoundMutation('success');
        return;
      }
      if (!canPlaySpeaker && canPlayHeadphones) {
        playSoundHeadphones();
        return;
      }

      // Both are available, alternate
      if (nextOutputRef.current === 'speaker') {
        playSpeakerSoundMutation('success');
        nextOutputRef.current = 'headphones';
      } else {
        playSoundHeadphones();
        nextOutputRef.current = 'speaker';
      }
    },
    speakerEnabled || (headphonesEnabled && headphonesAvailable)
      ? SOUND_INTERVAL_SECONDS * 1000
      : null
  );

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

  function togglePrinterTaskRunning() {
    setPrinterTaskRunningMutation.mutate(
      getPrinterTaskStatusQuery.data?.taskStatus === 'paused'
    );
  }

  function powerDown() {
    powerDownMutation.mutate();
  }

  const cardStatus = getElectricalTestingStatusesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusesQuery.data?.usbDrive;

  return (
    <React.Fragment>
      <CpuMetricsDisplay
        metrics={getCpuMetricsQuery.data}
        orientation="portrait"
      />
      <ElectricalTestingScreen
        topOffset="100px"
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
            id: 'printer',
            icon: <Icons.Print />,
            title: 'Printer',
            body: (
              <React.Fragment>
                {formatPrinterStatus(
                  getPrinterStatusQuery.data,
                  getPrinterTaskStatusQuery.data
                )}
                <br />
                <Button
                  style={{ transform: 'scale(0.5)' }}
                  onPress={() => printTestPageMutation.mutate()}
                  disabled={
                    printTestPageMutation.isLoading ||
                    !getPrinterStatusQuery.data?.connected
                  }
                >
                  {printTestPageMutation.isLoading
                    ? 'Printing...'
                    : 'Print Test Page'}
                </Button>
              </React.Fragment>
            ),
            isRunning: getPrinterTaskStatusQuery.data?.taskStatus === 'running',
            toggleIsRunning: togglePrinterTaskRunning,
          },
          {
            id: 'barcodeScanner',
            icon: <Icons.Search />,
            title: 'Barcode Scanner',
            body: formatBarcodeStatus(getBarcodeStatusQuery.data),
          },
          {
            id: 'sound',
            icon:
              speakerEnabled || headphonesEnabled ? (
                <Icons.VolumeUp />
              ) : (
                <Icons.VolumeMute />
              ),
            title: 'Sound',
            body: (
              <AudioControls
                speakerEnabled={speakerEnabled}
                setSpeakerEnabled={setSpeakerEnabled}
                headphonesEnabled={headphonesEnabled}
                setHeadphonesEnabled={setHeadphonesEnabled}
                headphonesAvailable={headphonesAvailable}
              />
            ),
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

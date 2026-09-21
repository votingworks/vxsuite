import {
  Button,
  CheckboxButton,
  CpuMetricsDisplay,
  ElectricalTestingScreen,
  HeadphoneCalibrationButton,
  Icons,
  InputControls,
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
  printTestPage,
  setCardReaderTaskRunning,
  setPrinterTaskRunning,
  setUsbDriveTaskRunning,
  setVolume,
  systemCallApi,
  useApiClient,
} from './api.js';
import * as api from './api.js';
import { useSound } from '../hooks/use_sound.js';

const SOUND_INTERVAL_SECONDS = 10;

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
  gap: 0.5rem;
`;

function AudioControls({
  speakerEnabled,
  setSpeakerEnabled,
  headphonesEnabled,
  setHeadphonesEnabled,
  setCalibratingHeadphones,
  playingSpeakerSound,
}: {
  speakerEnabled: boolean;
  setSpeakerEnabled: (enabled: boolean) => void;
  headphonesEnabled: boolean;
  setHeadphonesEnabled: (enabled: boolean) => void;
  setCalibratingHeadphones: (calibrating: boolean) => void;
  playingSpeakerSound: boolean;
}): JSX.Element {
  const setVolumeMutation = setVolume.useMutation();

  return (
    <AudioControlsContainer>
      <CheckboxButton
        label="Speaker"
        isChecked={speakerEnabled}
        onChange={setSpeakerEnabled}
      />
      <CheckboxButton
        label="Headphones"
        isChecked={headphonesEnabled}
        onChange={setHeadphonesEnabled}
      />
      <HeadphoneCalibrationButton
        audioUrl="/sounds/tts-sample.mp3"
        // Avoid setting volume for the speaker instead of headphones.
        disabled={playingSpeakerSound}
        onBegin={() => {
          setCalibratingHeadphones(true);
          // Calibration must be performed against max system volume
          setVolumeMutation.mutate(100);
        }}
        onEnd={() => {
          // Return to a safe listening level
          setVolumeMutation.mutate(40);
          setCalibratingHeadphones(false);
        }}
      />
    </AudioControlsContainer>
  );
}

export function AppRoot(): JSX.Element {
  const apiClient = useApiClient();
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

  const playSpeakerSoundMutation = api.playSpeakerSound.useMutation();
  const playingSpeakerSound = playSpeakerSoundMutation.status === 'loading';
  const playSpeakerSound = playSpeakerSoundMutation.mutate;

  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true);
  const [calibratingHeadphones, setCalibratingHeadphones] = useState(false);

  // Track which output to play next for alternating
  const nextOutputRef = useRef<'speaker' | 'headphones'>('speaker');

  // Headphones play through the frontend
  const playSoundHeadphones = useSound('success-5s');

  const soundsEnabled =
    !calibratingHeadphones && (speakerEnabled || headphonesEnabled);

  // Alternating sound playback
  useInterval(
    () => {
      const canPlaySpeaker = speakerEnabled;
      const canPlayHeadphones = headphonesEnabled;

      if (!canPlaySpeaker && !canPlayHeadphones) {
        return;
      }

      // If only one output is available, use that
      if (canPlaySpeaker && !canPlayHeadphones) {
        playSpeakerSound('success');
        return;
      }
      if (!canPlaySpeaker && canPlayHeadphones) {
        playSoundHeadphones();
        return;
      }

      // Both are available, alternate
      if (nextOutputRef.current === 'speaker') {
        playSpeakerSound('success');
        nextOutputRef.current = 'headphones';
      } else {
        playSoundHeadphones();
        nextOutputRef.current = 'speaker';
      }
    },
    soundsEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null
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
    <ElectricalTestingScreen
      header={
        <CpuMetricsDisplay
          metrics={getCpuMetricsQuery.data}
          orientation="portrait"
        />
      }
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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {formatPrinterStatus(
                getPrinterStatusQuery.data,
                getPrinterTaskStatusQuery.data
              )}
              <br />
              <Button
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
            </div>
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
              setCalibratingHeadphones={setCalibratingHeadphones}
              playingSpeakerSound={playingSpeakerSound}
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
      powerDown={powerDown}
      usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
      apiClient={apiClient}
    />
  );
}

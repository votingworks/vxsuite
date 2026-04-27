import {
  Button,
  CpuMetricsDisplay,
  ElectricalTestingScreen,
  HeadphoneCalibrationButton,
  Icons,
  InputControls,
  MinTouchDurationGuard,
  P,
} from '@votingworks/ui';
import { useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import {
  getCpuMetrics,
  getElectricalTestingStatuses,
  getMinTouchDurationMs,
  getPatConsecutiveStatusThreshold,
  setCardReaderTaskRunning,
  setMinTouchDurationMs,
  setPaperHandlerTaskRunning,
  setPatConsecutiveStatusThreshold,
  setUsbDriveTaskRunning,
  useApiClient,
} from './api';
import { useSound } from '../hooks/use_sound';

const MIN_TOUCH_DURATION_STEP_MS = 10;
const MIN_TOUCH_DURATION_MIN_MS = 0;
const MIN_TOUCH_DURATION_MAX_MS = 500;

const PAT_CONSECUTIVE_STATUS_THRESHOLD_MIN = 1;
const PAT_CONSECUTIVE_STATUS_THRESHOLD_MAX = 20;

const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SOUND_INTERVAL_SECONDS = 5;

export function AppRoot(): JSX.Element {
  const apiClient = useApiClient();
  const getElectricalTestingStatusesQuery =
    getElectricalTestingStatuses.useQuery();
  const getCpuMetricsQuery = getCpuMetrics.useQuery();
  const setPaperHandlerTaskRunningMutation =
    setPaperHandlerTaskRunning.useMutation();
  const setCardReaderTaskRunningMutation =
    setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation = setUsbDriveTaskRunning.useMutation();

  const [calibratingHeadphones, setCalibratingHeadphones] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const getMinTouchDurationMsQuery = getMinTouchDurationMs.useQuery();
  const setMinTouchDurationMsMutation = setMinTouchDurationMs.useMutation();
  const minTouchDurationMs = getMinTouchDurationMsQuery.data;
  const getPatConsecutiveStatusThresholdQuery =
    getPatConsecutiveStatusThreshold.useQuery();
  const setPatConsecutiveStatusThresholdMutation =
    setPatConsecutiveStatusThreshold.useMutation();
  const patConsecutiveStatusThreshold =
    getPatConsecutiveStatusThresholdQuery.data;
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

  useInterval(
    playSound,
    isSoundEnabled && !calibratingHeadphones
      ? SOUND_INTERVAL_SECONDS * 1000
      : null
  );

  const cardStatus = getElectricalTestingStatusesQuery.data?.card;
  const paperHandlerStatus =
    getElectricalTestingStatusesQuery.data?.paperHandler;
  const usbDriveStatus = getElectricalTestingStatusesQuery.data?.usbDrive;

  return (
    <MinTouchDurationGuard
      minTouchDurationMs={minTouchDurationMs}
      style={{ height: '100%' }}
    >
      <ElectricalTestingScreen
        header={
          <CpuMetricsDisplay
            metrics={getCpuMetricsQuery.data}
            orientation="portrait"
          />
        }
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
            body: (
              <div>
                <P>{isSoundEnabled ? 'Enabled' : 'Disabled'}</P>
                <HeadphoneCalibrationButton
                  audioUrl="/sounds/tts-sample.mp3"
                  onBegin={() => setCalibratingHeadphones(true)}
                  onEnd={() => setCalibratingHeadphones(false)}
                />
              </div>
            ),
            isRunning: isSoundEnabled,
            toggleIsRunning: toggleSoundEnabled,
          },
          {
            id: 'inputs',
            icon: <Icons.Mouse />,
            title: 'Inputs',
            body: <InputControls />,
          },
          {
            id: 'advancedSettings',
            icon: <Icons.Settings />,
            title: 'Advanced Settings',
            body: (
              <div>
                <Button
                  onPress={() => setShowAdvancedSettings((prev) => !prev)}
                >
                  {showAdvancedSettings ? 'Hide' : 'Show'}
                </Button>
                {showAdvancedSettings && minTouchDurationMs !== undefined && (
                  <SettingsRow style={{ marginTop: '0.5rem' }}>
                    <span>Min Touch Duration:</span>
                    <Button
                      onPress={() =>
                        setMinTouchDurationMsMutation.mutate(
                          Math.max(
                            MIN_TOUCH_DURATION_MIN_MS,
                            minTouchDurationMs - MIN_TOUCH_DURATION_STEP_MS
                          )
                        )
                      }
                      disabled={minTouchDurationMs <= MIN_TOUCH_DURATION_MIN_MS}
                    >
                      -
                    </Button>
                    <span>{minTouchDurationMs}ms</span>
                    <Button
                      onPress={() =>
                        setMinTouchDurationMsMutation.mutate(
                          Math.min(
                            MIN_TOUCH_DURATION_MAX_MS,
                            minTouchDurationMs + MIN_TOUCH_DURATION_STEP_MS
                          )
                        )
                      }
                      disabled={minTouchDurationMs >= MIN_TOUCH_DURATION_MAX_MS}
                    >
                      +
                    </Button>
                  </SettingsRow>
                )}
                {showAdvancedSettings &&
                  patConsecutiveStatusThreshold !== undefined && (
                    <SettingsRow style={{ marginTop: '0.5rem' }}>
                      <span>PAT Consecutive Status Threshold:</span>
                      <Button
                        onPress={() =>
                          setPatConsecutiveStatusThresholdMutation.mutate(
                            Math.max(
                              PAT_CONSECUTIVE_STATUS_THRESHOLD_MIN,
                              patConsecutiveStatusThreshold - 1
                            )
                          )
                        }
                        disabled={
                          patConsecutiveStatusThreshold <=
                          PAT_CONSECUTIVE_STATUS_THRESHOLD_MIN
                        }
                      >
                        -
                      </Button>
                      <span>{patConsecutiveStatusThreshold}</span>
                      <Button
                        onPress={() =>
                          setPatConsecutiveStatusThresholdMutation.mutate(
                            Math.min(
                              PAT_CONSECUTIVE_STATUS_THRESHOLD_MAX,
                              patConsecutiveStatusThreshold + 1
                            )
                          )
                        }
                        disabled={
                          patConsecutiveStatusThreshold >=
                          PAT_CONSECUTIVE_STATUS_THRESHOLD_MAX
                        }
                      >
                        +
                      </Button>
                    </SettingsRow>
                  )}
              </div>
            ),
          },
        ]}
        usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
        apiClient={apiClient}
      />
    </MinTouchDurationGuard>
  );
}

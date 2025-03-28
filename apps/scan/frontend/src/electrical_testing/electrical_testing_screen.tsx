import type { ElectricalTestingApi } from '@votingworks/scan-backend';
import {
  Button,
  Caption,
  Card,
  H6,
  Icons,
  Main,
  Screen,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useInterval } from 'use-interval';
import { useSound } from '../utils/use_sound';
import {
  getElectricalTestingStatuses,
  getLatestScannedSheet,
  getTestTaskStatuses,
  setCardReaderLoopRunning,
  setPrinterLoopRunning,
  setScannerLoopRunning,
  setUsbDriveLoopRunning,
  systemCallApi,
} from './api';
import { SheetImagesModal } from './sheet_images_modal';

type ElectricalTestingComponent = keyof ReturnType<
  ElectricalTestingApi['getElectricalTestingStatuses']
>;
type TaskStatus = Exclude<
  ReturnType<
    ElectricalTestingApi['getElectricalTestingStatuses']
  >[ElectricalTestingComponent],
  undefined
>['taskStatus'];

const SOUND_INTERVAL_SECONDS = 5;

const Row = styled.div<{ gap?: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ gap = 0 }) => gap};
`;

const Column = styled.div<{ gap?: string }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: ${({ gap = 0 }) => gap};
`;

const Small = styled.span`
  font-size: 0.45rem;
`;

const SmallButton = styled(Button)`
  transform: scale(0.5);
`;

const ExtraSmall = styled.span`
  font-size: 0.3rem;
`;

const PlayPauseButton = styled.button`
  flex-shrink: 0;
  background-color: #ddd;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;

  svg {
    scale: 0.8;
  }
`;

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

function TaskStatusButton({
  taskStatus,
  onPress,
}: {
  taskStatus: TaskStatus;
  onPress: () => void;
}) {
  return (
    <PlayPauseButton onClick={onPress}>
      {taskStatus === 'running' ? <Icons.Pause /> : <Icons.Play />}
    </PlayPauseButton>
  );
}

function formatTimestamp(timestamp: DateTime): string {
  return timestamp.toLocal().toFormat('h:mm:ss a MM/dd/yyyy');
}

function StatusCard({
  title,
  statusMessage,
  body,
  updatedAt,
  taskStatus,
  onToggleRunning,
}: {
  title: React.ReactNode;
  statusMessage?: React.ReactNode;
  body?: React.ReactNode;
  updatedAt?: DateTime;
  taskStatus?: TaskStatus;
  onToggleRunning?: () => void;
}) {
  return (
    <Card
      style={{
        width: '600px',
        height: '235px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Row style={{ height: '100%', alignItems: 'stretch' }}>
        <Column style={{ flexGrow: 1 }}>
          <H6 style={{ flexGrow: 0 }}>{title}</H6>
          {statusMessage && (
            <Caption
              style={{
                flexGrow: 1,
                overflowWrap: 'anywhere',
                maxHeight: '2rem',
                overflow: 'hidden',
              }}
            >
              <Small>{statusMessage}</Small>
            </Caption>
          )}
          {body && <Caption style={{ flexGrow: 1 }}>{body}</Caption>}
          {updatedAt && (
            <Caption style={{ flexGrow: 0 }}>
              <ExtraSmall>{formatTimestamp(updatedAt)}</ExtraSmall>
            </Caption>
          )}
        </Column>
        {taskStatus && onToggleRunning && (
          <Column style={{ flexGrow: 0, alignContent: 'center' }}>
            <TaskStatusButton
              taskStatus={taskStatus}
              onPress={onToggleRunning}
            />
          </Column>
        )}
      </Row>
    </Card>
  );
}

export function ElectricalTestingScreen(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    getElectricalTestingStatuses.useQuery();
  const getTestTaskStatusesQuery = getTestTaskStatuses.useQuery();
  const setCardReaderLoopRunningMutation =
    setCardReaderLoopRunning.useMutation();
  const setUsbDriveLoopRunningMutation = setUsbDriveLoopRunning.useMutation();
  const setPrinterLoopRunningMutation = setPrinterLoopRunning.useMutation();
  const setScannerLoopRunningMutation = setScannerLoopRunning.useMutation();
  const getLatestScannedSheetQuery = getLatestScannedSheet.useQuery();
  const [isShowingLatestSheet, setIsShowingLatestSheet] = useState(false);

  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const playSound = useSound('success');

  function toggleCardReaderTaskRunning() {
    setCardReaderLoopRunningMutation.mutate(
      getTestTaskStatusesQuery.data?.card === 'paused'
    );
  }

  function toggleUsbDriveTaskRunning() {
    setUsbDriveLoopRunningMutation.mutate(
      getTestTaskStatusesQuery.data?.usbDrive === 'paused'
    );
  }

  function togglePrinterTaskRunning() {
    setPrinterLoopRunningMutation.mutate(
      getTestTaskStatusesQuery.data?.printer === 'paused'
    );
  }

  function toggleScannerTaskRunning() {
    setScannerLoopRunningMutation.mutate(
      getTestTaskStatusesQuery.data?.scanner === 'paused'
    );
  }

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

  const powerDownMutation = systemCallApi.powerDown.useMutation();

  function powerDown() {
    powerDownMutation.mutate();
  }

  function toggleSoundEnabled() {
    setIsSoundEnabled((prev) => !prev);
  }

  useInterval(playSound, isSoundEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null);

  const cardStatus = getElectricalTestingStatusMessagesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusMessagesQuery.data?.usbDrive;
  const printerStatus = getElectricalTestingStatusMessagesQuery.data?.printer;
  const scannerStatus = getElectricalTestingStatusMessagesQuery.data?.scanner;

  return (
    <Screen>
      <Main>
        <Column style={{ height: '100%' }}>
          <Column
            style={{
              alignItems: 'center',
              gap: '1rem',
              justifyContent: 'center',
            }}
          >
            <Row gap="1rem">
              <StatusCard
                title={
                  <React.Fragment>
                    <Icons.SimCard /> Card Reader
                  </React.Fragment>
                }
                statusMessage={cardStatus?.statusMessage ?? 'Unknown'}
                updatedAt={cardStatus?.updatedAt}
                taskStatus={cardStatus?.taskStatus}
                onToggleRunning={toggleCardReaderTaskRunning}
              />

              <StatusCard
                title={
                  <React.Fragment>
                    <Icons.File /> Scanner
                  </React.Fragment>
                }
                body={
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
                }
                updatedAt={scannerStatus?.updatedAt}
                taskStatus={scannerStatus?.taskStatus}
                onToggleRunning={toggleScannerTaskRunning}
              />
            </Row>

            <Row gap="1rem">
              <StatusCard
                title={
                  <React.Fragment>
                    <Icons.Print /> Printer
                  </React.Fragment>
                }
                statusMessage={printerStatus?.statusMessage ?? 'Unknown'}
                updatedAt={printerStatus?.updatedAt}
                taskStatus={printerStatus?.taskStatus}
                onToggleRunning={togglePrinterTaskRunning}
              />

              <StatusCard
                title={
                  <React.Fragment>
                    <Icons.HardDrive /> USB Drive
                  </React.Fragment>
                }
                statusMessage={usbDriveStatus?.statusMessage ?? 'Unknown'}
                updatedAt={usbDriveStatus?.updatedAt}
                taskStatus={usbDriveStatus?.taskStatus}
                onToggleRunning={toggleUsbDriveTaskRunning}
              />
            </Row>

            <Row gap="1rem">
              <StatusCard
                title={
                  <React.Fragment>
                    {isSoundEnabled ? <Icons.VolumeUp /> : <Icons.VolumeMute />}{' '}
                    Sound
                  </React.Fragment>
                }
                statusMessage={isSoundEnabled ? 'Enabled' : 'Disabled'}
                taskStatus={isSoundEnabled ? 'running' : 'paused'}
                onToggleRunning={toggleSoundEnabled}
              />

              <StatusCard
                title={
                  <React.Fragment>
                    <Icons.Mouse /> Inputs
                  </React.Fragment>
                }
                body={
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
                }
              />
            </Row>
          </Column>
          <Row style={{ justifyContent: 'center' }}>
            <SmallButton icon={<Icons.PowerOff />} onPress={powerDown}>
              Power Off
            </SmallButton>
          </Row>
        </Column>
        {isShowingLatestSheet && getLatestScannedSheetQuery.data && (
          <SheetImagesModal
            paths={getLatestScannedSheetQuery.data}
            onClose={() => setIsShowingLatestSheet(false)}
          />
        )}
      </Main>
    </Screen>
  );
}

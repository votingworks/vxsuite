import {
  Button,
  RadioGroup,
  Caption,
  ExportLogsModal,
  H6,
  Icons,
  Main,
  Screen,
  CheckboxGroup,
  CheckboxButton,
} from '@votingworks/ui';
import type { ScanningMode } from '@votingworks/scan-backend';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import { useSound } from '../utils/use_sound';
import * as api from './api';
import { SheetImagesModal } from './sheet_images_modal';
import { iter } from '@votingworks/basics';

const SOUND_INTERVAL_SECONDS = 5;

function CounterButton() {
  const [count, setCount] = useState(0);

  return (
    <Button onPress={() => setCount((prev) => prev + 1)}>
      Tap Count: {count}
    </Button>
  );
}

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
  font-size: 0.9rem;
`;

const ExtraSmall = styled.span`
  font-size: 0.6rem;
`;

const RadioOptionTitle = styled(H6)`
  margin-bottom: 0;
`;

const PlayPauseButtonBase = styled.button`
  flex-shrink: 0;
  background-color: #ddd;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  box-shadow: 2px 2px 4px 0px #999;
  font-size: 1rem;
  padding: 0;
`;

function Timestamp({ value }: { value: DateTime }) {
  return (
    <Caption style={{ flexGrow: 0 }}>
      <ExtraSmall>{formatTimestamp(value)}</ExtraSmall>
    </Caption>
  );
}

function StatusLine({ message }: { message?: string }) {
  return (
    <Caption
      style={{
        flexGrow: 1,
        overflowWrap: 'anywhere',
        maxHeight: '2rem',
        overflow: 'hidden',
      }}
    >
      <Small>{message ?? 'Unknown'}</Small>
    </Caption>
  );
}

function ComponentStatus({
  timestamp,
  message,
}: {
  timestamp: DateTime;
  message?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Timestamp value={timestamp} />
      <StatusLine message={message} />
    </div>
  );
}

function PlayPauseButton({
  isRunning,
  onPress,
}: {
  isRunning: boolean;
  onPress: () => void;
}) {
  return (
    <PlayPauseButtonBase onClick={onPress}>
      {isRunning ? <Icons.Pause /> : <Icons.Play />}
    </PlayPauseButtonBase>
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
  isRunning,
  onToggleRunning,
}: {
  title: React.ReactNode;
  statusMessage?: React.ReactNode;
  body?: React.ReactNode;
  updatedAt?: DateTime;
  isRunning?: boolean;
  onToggleRunning?: () => void;
}) {
  return (
    <Row style={{ height: '100%', alignItems: 'stretch', gap: '1em' }}>
      {typeof isRunning === 'boolean' && onToggleRunning && (
        <Column style={{ flexGrow: 0, alignContent: 'center' }}>
          <PlayPauseButton isRunning={isRunning} onPress={onToggleRunning} />
        </Column>
      )}
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
    </Row>
  );
}

export function AppRoot(): JSX.Element {
  const getElectricalTestingStatusMessagesQuery =
    api.getElectricalTestingStatuses.useQuery();
  const setCardReaderTaskRunningMutation =
    api.setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation =
    api.setUsbDriveTaskRunning.useMutation();
  const setPrinterTaskRunningMutation = api.setPrinterTaskRunning.useMutation();
  const setScannerTaskRunningMutation = api.setScannerTaskRunning.useMutation();
  const getLatestScannedSheetQuery = api.getLatestScannedSheet.useQuery();
  const powerDownMutation = api.systemCallApi.powerDown.useMutation();
  const [isShowingLatestSheet, setIsShowingLatestSheet] = useState(true);
  const [isSaveLogsModalOpen, setIsSaveLogsModalOpen] = React.useState(false);

  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true);

  const playSoundHeadphones = useSound('success');
  const playSoundSpeaker = api.playSound.useMutation().mutate;

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

  function toggleHeadphonesEnabled() {
    setHeadphonesEnabled((prev) => !prev);
  }

  function toggleSpeakerEnabled() {
    setSpeakerEnabled((prev) => !prev);
  }

  function powerDown() {
    powerDownMutation.mutate();
  }

  const setScannerTaskModeMutation = api.setScannerTaskMode.useMutation();

  function setScanningMode(mode: ScanningMode) {
    setScannerTaskModeMutation.mutate(mode);
  }

  useInterval(
    () => playSoundSpeaker({ name: 'success' }),
    speakerEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null
  );
  useInterval(
    playSoundHeadphones,
    headphonesEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null
  );

  const cardStatus = getElectricalTestingStatusMessagesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusMessagesQuery.data?.usbDrive;
  const printerStatus = getElectricalTestingStatusMessagesQuery.data?.printer;
  const scannerStatus = getElectricalTestingStatusMessagesQuery.data?.scanner;

  function ScannerControls() {
    return (
      <div>
        <H6 style={{ flexGrow: 0 }}>
          <Icons.File /> Scanner
        </H6>
        {scannerStatus && (
          <ComponentStatus
            timestamp={scannerStatus.updatedAt}
            message={scannerStatus.statusMessage}
          />
        )}
        <Caption style={{ flexGrow: 1 }}>
          <div
            style={{
              marginTop: '1em',
              right: '0',
              bottom: '0',
              display: 'flex',
              flexDirection: 'column',
              gap: '1em',
            }}
          >
            {scannerStatus && (
              <RadioGroup
                label="Scanning mode"
                value={scannerStatus.mode}
                onChange={(mode) => mode && setScanningMode(mode)}
                options={
                  [
                    {
                      value: 'shoe-shine',
                      label: (
                        <React.Fragment>
                          <RadioOptionTitle>Shoe-shine</RadioOptionTitle>
                          <Caption>Scan continuously and automatically</Caption>
                        </React.Fragment>
                      ),
                    },
                    {
                      value: 'manual-rear',
                      label: (
                        <React.Fragment>
                          <RadioOptionTitle>Manual (rear)</RadioOptionTitle>
                          <Caption>Eject to the rear after scanning</Caption>
                        </React.Fragment>
                      ),
                    },
                    {
                      value: 'manual-front',
                      label: (
                        <React.Fragment>
                          <RadioOptionTitle>Manual (front)</RadioOptionTitle>
                          <Caption>Eject to the front after scanning</Caption>
                        </React.Fragment>
                      ),
                    },
                    {
                      value: 'disabled',
                      label: (
                        <React.Fragment>
                          <RadioOptionTitle>Disabled</RadioOptionTitle>
                          <Caption>Do not scan sheets</Caption>
                        </React.Fragment>
                      ),
                    },
                  ] as const
                }
              ></RadioGroup>
            )}
          </div>
        </Caption>
      </div>
    );
  }

  function ScannerPageInfo() {
    const [front, back] = getLatestScannedSheetQuery.data ?? [];
    return (
      <React.Fragment>
        <div
          style={{
            flexGrow: 3,
            backgroundColor: '#ccc',
            backgroundImage: front && `url(${front})`,
            backgroundSize: 'contain',
            height: '100%',
          }}
        >
          &nbsp;
        </div>
        <div
          style={{
            flexGrow: 3,
            backgroundColor: '#ccc',
            backgroundImage: back && `url(${back})`,
            backgroundSize: 'contain',
            height: '100%',
          }}
        >
          &nbsp;
        </div>
      </React.Fragment>
    );
  }

  function CardReaderControls() {
    return (
      <fieldset
        aria-label="Card Reader"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5em',
        }}
      >
        <legend
          style={{ fontWeight: 'bold', marginBottom: '0.5em' }}
          aria-hidden
        >
          <Icons.SimCard /> Card Reader
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cardStatus && (
            <ComponentStatus
              timestamp={cardStatus.updatedAt}
              message={cardStatus.statusMessage}
            />
          )}
        </div>
        <CheckboxButton
          label="Enabled"
          isChecked={cardStatus?.taskStatus === 'running'}
          onChange={(isRunning) => {
            setCardReaderTaskRunningMutation.mutate(isRunning);
          }}
        />
      </fieldset>
    );
  }

  function PrinterControls() {
    return (
      <fieldset
        aria-label="Printer"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5em',
        }}
      >
        <legend
          style={{ fontWeight: 'bold', marginBottom: '0.5em' }}
          aria-hidden
        >
          <Icons.Print /> Printer
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {printerStatus && (
            <ComponentStatus
              timestamp={printerStatus.updatedAt}
              message={printerStatus.statusMessage}
            />
          )}
        </div>
        <CheckboxButton
          label="Enabled"
          isChecked={printerStatus?.taskStatus === 'running'}
          onChange={(isRunning) => {
            setPrinterTaskRunningMutation.mutate(isRunning);
          }}
        />
      </fieldset>
    );
  }

  function UsbDriveControls() {
    return (
      <fieldset
        aria-label="USB Drive"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5em',
        }}
      >
        <legend
          style={{ fontWeight: 'bold', marginBottom: '0.5em' }}
          aria-hidden
        >
          <Icons.UsbDrive /> USB Drive
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {usbDriveStatus && <Timestamp value={usbDriveStatus.updatedAt} />}
          {usbDriveStatus && (
            <StatusLine message={usbDriveStatus.statusMessage} />
          )}
        </div>
        <CheckboxButton
          label="Enabled"
          isChecked={usbDriveStatus?.taskStatus === 'running'}
          onChange={(isRunning) => {
            setUsbDriveTaskRunningMutation.mutate(isRunning);
          }}
        />
      </fieldset>
    );
  }

  function AudioControls() {
    return (
      <CheckboxGroup
        label={
          <React.Fragment>
            <Icons.SoundOn /> Audio
          </React.Fragment>
        }
        aria-label="Audio"
        value={[
          ...(speakerEnabled ? ['speaker' as const] : []),
          ...(headphonesEnabled ? ['headphones' as const] : []),
        ]}
        onChange={(values) => {
          setSpeakerEnabled(values.includes('speaker'));
          setHeadphonesEnabled(values.includes('headphones'));
        }}
        options={
          [
            { value: 'speaker', label: 'Speaker' },
            { value: 'headphones', label: 'Headphones' },
          ] as const
        }
      />
    );
  }

  function InputControls() {
    return (
      <Column style={{ flexGrow: 1 }}>
        <H6 style={{ flexGrow: 0 }}>
          <Icons.Mouse /> Inputs
        </H6>
        <Caption style={{ flexGrow: 1 }}>
          <Column>
            <CounterButton />

            <ExtraSmall>
              Last key press:{' '}
              {lastKeyPress ? (
                <React.Fragment>
                  <code>{lastKeyPress.key}</code> at{' '}
                  {formatTimestamp(lastKeyPress.pressedAt)}
                </React.Fragment>
              ) : (
                'n/a'
              )}
            </ExtraSmall>
          </Column>
        </Caption>
      </Column>
    );
  }

  return (
    <Screen>
      <Main centerChild>
        <Column style={{ height: '100%', paddingBottom: '2rem' }}>
          <Column
            style={{
              alignItems: 'center',
              gap: '1rem',
              justifyContent: 'center',
            }}
          >
            <Row gap="2rem" style={{ width: '1600px' }}>
              <Column
                style={{
                  flexGrow: 2,
                  height: '100%',
                  gap: '2em',
                }}
              >
                <CardReaderControls />
                <PrinterControls />
                <UsbDriveControls />
                <AudioControls />
                <InputControls />
              </Column>

              <Column
                style={{
                  flexGrow: 3,
                  height: '100%',
                  gap: '2em',
                }}
              >
                <ScannerControls />
              </Column>

              <ScannerPageInfo />
            </Row>
          </Column>

          <Row gap="1rem" style={{ justifyContent: 'center' }}>
            <Button
              icon={<Icons.Save />}
              onPress={() => setIsSaveLogsModalOpen(true)}
            >
              Save Logs
            </Button>
            <Button icon={<Icons.PowerOff />} onPress={powerDown}>
              Power Down
            </Button>
          </Row>
        </Column>

        {isSaveLogsModalOpen && usbDriveStatus && (
          <ExportLogsModal
            onClose={() => setIsSaveLogsModalOpen(false)}
            usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
          />
        )}
      </Main>
    </Screen>
  );
}

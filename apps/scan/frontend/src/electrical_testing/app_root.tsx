import {
  Button,
  Caption,
  Card,
  ExportLogsModal,
  H6,
  Icons,
  Main,
  Screen,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import { useSound } from '../utils/use_sound';
import * as api from './api';
import { SheetImagesModal } from './sheet_images_modal';

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

const PlayPauseButtonBase = styled.button`
  flex-shrink: 0;
  background-color: #ddd;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  font-size: 2rem;
  padding: 0;
`;

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
  const [isShowingLatestSheet, setIsShowingLatestSheet] = useState(false);

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

  useInterval(
    () => playSoundSpeaker({ name: 'success' }),
    speakerEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null
  );
  useInterval(
    playSoundHeadphones,
    headphonesEnabled ? SOUND_INTERVAL_SECONDS * 1000 : null
  );

  const [isSaveLogsModalOpen, setIsSaveLogsModalOpen] = React.useState(false);

  const cardStatus = getElectricalTestingStatusMessagesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusMessagesQuery.data?.usbDrive;
  const printerStatus = getElectricalTestingStatusMessagesQuery.data?.printer;
  const scannerStatus = getElectricalTestingStatusMessagesQuery.data?.scanner;

  return (
    <Screen>
      <Main centerChild>
        <Column style={{ height: '100%' }}>
          <Column
            style={{
              alignItems: 'center',
              gap: '1rem',
              justifyContent: 'center',
            }}
          >
            <Row gap="1rem">
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
                    <H6 style={{ flexGrow: 0 }}>
                      <Icons.File /> Scanner
                    </H6>
                    <Caption style={{ flexGrow: 1 }}>
                      <Caption
                        style={{
                          flexGrow: 1,
                          overflowWrap: 'anywhere',
                          maxHeight: '2rem',
                          overflow: 'hidden',
                        }}
                      >
                        <Small>
                          {scannerStatus?.statusMessage ?? 'Unknown'}
                        </Small>
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
                            transform: 'translate(100%, 100%)',
                          }}
                        >
                          View Latest Sheet
                        </Button>
                      )}
                    </Caption>
                    {scannerStatus?.updatedAt && (
                      <Caption style={{ flexGrow: 0 }}>
                        <ExtraSmall>
                          {formatTimestamp(scannerStatus.updatedAt)}
                        </ExtraSmall>
                      </Caption>
                    )}
                  </Column>
                  {typeof (scannerStatus?.taskStatus === 'running') ===
                    'boolean' && (
                    <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                      <PlayPauseButton
                        isRunning={scannerStatus?.taskStatus === 'running'}
                        onPress={toggleScannerTaskRunning}
                      />
                    </Column>
                  )}
                </Row>
              </Card>
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
                    <H6 style={{ flexGrow: 0 }}>
                      <Icons.SimCard /> Card Reader
                    </H6>
                    {cardStatus?.statusMessage && (
                      <Caption
                        style={{
                          flexGrow: 1,
                          overflowWrap: 'anywhere',
                          maxHeight: '2rem',
                          overflow: 'hidden',
                        }}
                      >
                        <Small>{cardStatus?.statusMessage}</Small>
                      </Caption>
                    )}
                    {cardStatus?.updatedAt && (
                      <Caption style={{ flexGrow: 0 }}>
                        <ExtraSmall>
                          {formatTimestamp(cardStatus.updatedAt)}
                        </ExtraSmall>
                      </Caption>
                    )}
                  </Column>
                  {typeof (cardStatus?.taskStatus === 'running') ===
                    'boolean' && (
                    <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                      <PlayPauseButton
                        isRunning={cardStatus?.taskStatus === 'running'}
                        onPress={toggleCardReaderTaskRunning}
                      />
                    </Column>
                  )}
                </Row>
              </Card>
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
                    <H6 style={{ flexGrow: 0 }}>
                      <Icons.Print /> Printer
                    </H6>
                    {printerStatus?.statusMessage && (
                      <Caption
                        style={{
                          flexGrow: 1,
                          overflowWrap: 'anywhere',
                          maxHeight: '2rem',
                          overflow: 'hidden',
                        }}
                      >
                        <Small>{printerStatus?.statusMessage}</Small>
                      </Caption>
                    )}
                    {printerStatus?.updatedAt && (
                      <Caption style={{ flexGrow: 0 }}>
                        <ExtraSmall>
                          {formatTimestamp(printerStatus.updatedAt)}
                        </ExtraSmall>
                      </Caption>
                    )}
                  </Column>
                  {typeof (printerStatus?.taskStatus === 'running') ===
                    'boolean' && (
                    <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                      <PlayPauseButton
                        isRunning={printerStatus?.taskStatus === 'running'}
                        onPress={togglePrinterTaskRunning}
                      />
                    </Column>
                  )}
                </Row>
              </Card>
            </Row>
            <Row gap="1rem">
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
                    <H6 style={{ flexGrow: 0 }}>
                      <Icons.UsbDrive /> USB Drive
                    </H6>
                    {usbDriveStatus?.statusMessage && (
                      <Caption
                        style={{
                          flexGrow: 1,
                          overflowWrap: 'anywhere',
                          maxHeight: '2rem',
                          overflow: 'hidden',
                        }}
                      >
                        <Small>{usbDriveStatus?.statusMessage}</Small>
                      </Caption>
                    )}
                    {usbDriveStatus?.updatedAt && (
                      <Caption style={{ flexGrow: 0 }}>
                        <ExtraSmall>
                          {formatTimestamp(usbDriveStatus.updatedAt)}
                        </ExtraSmall>
                      </Caption>
                    )}
                  </Column>
                  {typeof (usbDriveStatus?.taskStatus === 'running') ===
                    'boolean' && (
                    <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                      <PlayPauseButton
                        isRunning={usbDriveStatus?.taskStatus === 'running'}
                        onPress={toggleUsbDriveTaskRunning}
                      />
                    </Column>
                  )}
                </Row>
              </Card>
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
                    <H6 style={{ flexGrow: 0 }}>
                      {speakerEnabled ? (
                        <Icons.VolumeUp />
                      ) : (
                        <Icons.VolumeMute />
                      )}{' '}
                      Speaker
                    </H6>
                    <Caption style={{ flexGrow: 1 }}>
                      {speakerEnabled ? 'Enabled' : 'Disabled'}
                    </Caption>
                  </Column>
                  <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                    <PlayPauseButton
                      isRunning={speakerEnabled}
                      onPress={toggleSpeakerEnabled}
                    />
                  </Column>
                </Row>
              </Card>
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
                    <H6 style={{ flexGrow: 0 }}>
                      {headphonesEnabled ? (
                        <Icons.VolumeUp />
                      ) : (
                        <Icons.VolumeMute />
                      )}{' '}
                      Speaker
                    </H6>
                    <Caption style={{ flexGrow: 1 }}>
                      {headphonesEnabled ? 'Enabled' : 'Disabled'}
                    </Caption>
                  </Column>
                  <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                    <PlayPauseButton
                      isRunning={headphonesEnabled}
                      onPress={toggleHeadphonesEnabled}
                    />
                  </Column>
                </Row>
              </Card>
            </Row>
            <Row gap="1rem">
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
                    <H6 style={{ flexGrow: 0 }}>
                      <Icons.Mouse /> Inputs
                    </H6>
                    <Caption style={{ flexGrow: 1 }}>
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
                      </Caption>
                  </Column>
                </Row>
              </Card>
            </Row>
          </Column>
          <Row style={{ justifyContent: 'center' }}>
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
        {isSaveLogsModalOpen && usbDriveStatus?.underlyingDeviceStatus && (
          <ExportLogsModal
            onClose={() => setIsSaveLogsModalOpen(false)}
            usbDriveStatus={usbDriveStatus?.underlyingDeviceStatus}
          />
        )}
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

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
  const [isShowingLatestSheet, setIsShowingLatestSheet] = useState(false);
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
            <Row gap="2rem">
              <Row
                style={{ height: '100%', alignItems: 'stretch', gap: '1em' }}
              >
                <Column style={{ flexGrow: 1 }}>
                  <H6 style={{ flexGrow: 0 }}>
                    <Icons.File /> Scanner
                  </H6>
                  {scannerStatus?.updatedAt && (
                    <Caption style={{ flexGrow: 0 }}>
                      <ExtraSmall>
                        {formatTimestamp(scannerStatus.updatedAt)}
                      </ExtraSmall>
                    </Caption>
                  )}
                  <Caption style={{ flexGrow: 1 }}>
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
                                    <RadioOptionTitle>
                                      Shoe-shine
                                    </RadioOptionTitle>
                                    <Caption>
                                      Scan continuously and automatically
                                    </Caption>
                                  </React.Fragment>
                                ),
                              },
                              {
                                value: 'manual-rear',
                                label: (
                                  <React.Fragment>
                                    <RadioOptionTitle>
                                      Manual (rear)
                                    </RadioOptionTitle>
                                    <Caption>
                                      Eject to the rear after scanning
                                    </Caption>
                                  </React.Fragment>
                                ),
                              },
                              {
                                value: 'manual-front',
                                label: (
                                  <React.Fragment>
                                    <RadioOptionTitle>
                                      Manual (front)
                                    </RadioOptionTitle>
                                    <Caption>
                                      Eject to the front after scanning
                                    </Caption>
                                  </React.Fragment>
                                ),
                              },
                              {
                                value: 'disabled',
                                label: (
                                  <React.Fragment>
                                    <RadioOptionTitle>
                                      Disabled
                                    </RadioOptionTitle>
                                    <Caption>Do not scan sheets</Caption>
                                  </React.Fragment>
                                ),
                              },
                            ] as const
                          }
                        ></RadioGroup>
                      )}
                      {getLatestScannedSheetQuery.data && (
                        <Button
                          onPress={() => {
                            setIsShowingLatestSheet(true);
                          }}
                        >
                          View Latest Sheet
                        </Button>
                      )}
                    </div>
                  </Caption>
                </Column>
              </Row>

              <Row
                style={{ height: '100%', alignItems: 'stretch', gap: '1em' }}
              >
                <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                  <PlayPauseButton
                    isRunning={cardStatus?.taskStatus === 'running'}
                    onPress={toggleCardReaderTaskRunning}
                  />
                </Column>
                <Column style={{ flexGrow: 1 }}>
                  <H6 style={{ flexGrow: 0 }}>
                    {' '}
                    <Icons.SimCard /> Card Reader{' '}
                  </H6>
                  <Caption
                    style={{
                      flexGrow: 1,
                      overflowWrap: 'anywhere',
                      maxHeight: '2rem',
                      overflow: 'hidden',
                    }}
                  >
                    <Small>{cardStatus?.statusMessage ?? 'Unknown'}</Small>
                  </Caption>
                  {cardStatus && (
                    <Caption style={{ flexGrow: 0 }}>
                      <ExtraSmall>
                        {formatTimestamp(cardStatus.updatedAt)}
                      </ExtraSmall>
                    </Caption>
                  )}
                </Column>
              </Row>
            </Row>
            <Row gap="2rem">
              {[
                {
                  id: 'card',
                  icon: <Icons.SimCard />,
                  title: 'Card Reader',
                  statusMessage: cardStatus?.statusMessage ?? 'Unknown',
                  body: undefined,
                  isRunning: cardStatus?.taskStatus === 'running',
                  toggleIsRunning: toggleCardReaderTaskRunning,
                  updatedAt: cardStatus?.updatedAt,
                },
                {
                  id: 'printer',
                  icon: <Icons.Print />,
                  title: 'Printer',
                  statusMessage: printerStatus?.statusMessage ?? 'Unknown',
                  body: undefined,
                  isRunning: printerStatus?.taskStatus === 'running',
                  toggleIsRunning: togglePrinterTaskRunning,
                  updatedAt: printerStatus?.updatedAt,
                },
                {
                  id: 'usbDrive',
                  icon: <Icons.Print />,
                  title: 'USB Drive',
                  statusMessage: usbDriveStatus?.statusMessage ?? 'Unknown',
                  body: undefined,
                  isRunning: usbDriveStatus?.taskStatus === 'running',
                  toggleIsRunning: toggleUsbDriveTaskRunning,
                  updatedAt: usbDriveStatus?.updatedAt,
                },
              ].map((t) => (
                <Row
                  style={{
                    height: '100%',
                    alignItems: 'stretch',
                    gap: '1em',
                  }}
                  key={t.id}
                >
                  {typeof t.isRunning === 'boolean' && t.toggleIsRunning && (
                    <Column style={{ flexGrow: 0, alignContent: 'center' }}>
                      <PlayPauseButton
                        isRunning={t.isRunning}
                        onPress={t.toggleIsRunning}
                      />
                    </Column>
                  )}
                  <Column style={{ flexGrow: 1 }}>
                    <H6 style={{ flexGrow: 0 }}>
                      {t.icon} {t.title}
                    </H6>
                    {t.statusMessage && (
                      <Caption
                        style={{
                          flexGrow: 1,
                          overflowWrap: 'anywhere',
                          maxHeight: '2rem',
                          overflow: 'hidden',
                        }}
                      >
                        <Small>{t.statusMessage}</Small>
                      </Caption>
                    )}
                    {t.body && (
                      <Caption style={{ flexGrow: 1 }}>{t.body}</Caption>
                    )}
                    {t.updatedAt && (
                      <Caption style={{ flexGrow: 0 }}>
                        <ExtraSmall>{formatTimestamp(t.updatedAt)}</ExtraSmall>
                      </Caption>
                    )}
                  </Column>
                </Row>
              ))}
            </Row>
            <Row gap="2rem">
              <CheckboxGroup
                label={
                  <React.Fragment>
                    <Icons.SoundOn /> Audio
                  </React.Fragment>
                }
                aria-label="Audio"
                value={[
                  ...(speakerEnabled ? ['speaker'] : []),
                  ...(headphonesEnabled ? ['headphones'] : []),
                ]}
                onChange={(values) => {
                  setSpeakerEnabled(values.includes('speaker'));
                  setHeadphonesEnabled(values.includes('headphones'));
                }}
                options={[
                  { value: 'speaker', label: 'Speaker' },
                  { value: 'headphones', label: 'Headphones' },
                ]}
              />
              <Row
                style={{
                  height: '100%',
                  alignItems: 'stretch',
                  gap: '1em',
                }}
              >
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
              </Row>
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
        {isSaveLogsModalOpen && usbDriveStatus && (
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

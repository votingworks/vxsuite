import {
  Button,
  Caption,
  CheckboxButton,
  ExportLogsModal,
  H6,
  Icons,
  Main,
  RadioGroup,
  Screen,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import { SheetOf } from '@votingworks/types';
import type { HWTA } from '@votingworks/scan-backend';
import { useSound } from '../utils/use_sound';
import * as api from './api';

const SOUND_INTERVAL_SECONDS = 5;

function CounterButton() {
  const [count, setCount] = useState(0);

  return (
    <Button onPress={() => setCount((prev) => prev + 1)}>
      Tap Count: {count}
    </Button>
  );
}

const Row = styled.div<{ gap?: string; center?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ center }) => (center ? 'center' : 'space-between')};
  gap: ${({ gap = 0 }) => gap};
`;

const Column = styled.div<{ gap?: string; center?: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: ${({ gap = 0 }) => gap};
  justify-content: ${({ center }) => (center ? 'center' : 'space-between')};
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

function formatTimestamp(timestamp: DateTime): string {
  return timestamp
    .toLocal()
    .toFormat(
      timestamp.hasSame(DateTime.now(), 'day')
        ? 'h:mm:ss a'
        : 'h:mm:ss a MM/dd/yyyy'
    );
}

type StatusMessages = Awaited<
  ReturnType<api.ApiClient['getElectricalTestingStatuses']>
>;

function ScannerControls({
  status,
  setScanningMode,
}: {
  status?: StatusMessages['scanner'];
  setScanningMode: (mode: HWTA.ScanningMode) => void;
}): JSX.Element {
  return (
    <Column gap="0.5rem">
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
            <Small>{status?.statusMessage ?? 'Unknown'}</Small>
          </Caption>
        </Caption>
        {status?.updatedAt && (
          <Caption style={{ flexGrow: 0 }}>
            <ExtraSmall>{formatTimestamp(status.updatedAt)}</ExtraSmall>
          </Caption>
        )}
      </Column>
      <RadioGroup
        label="Scanning mode"
        value={status?.mode}
        onChange={(mode) => mode && setScanningMode(mode)}
        disabled={!status}
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
      />
    </Column>
  );
}

function CardReaderControls({
  status,
  setIsEnabled,
}: {
  status?: StatusMessages['card'];
  setIsEnabled: (isEnabled: boolean) => void;
}): JSX.Element {
  return (
    <Column gap="0.5rem">
      <Column>
        <H6>
          <Icons.SimCard /> Card Reader
        </H6>
        {status?.statusMessage && (
          <Caption
            style={{
              flexGrow: 1,
              overflowWrap: 'anywhere',
              maxHeight: '2rem',
              overflow: 'hidden',
            }}
          >
            <Small>{status?.statusMessage}</Small>
          </Caption>
        )}
        {status?.updatedAt && (
          <Caption style={{ flexGrow: 0 }}>
            <ExtraSmall>{formatTimestamp(status.updatedAt)}</ExtraSmall>
          </Caption>
        )}
      </Column>
      <CheckboxButton
        label="Enabled"
        isChecked={status?.taskStatus === 'running'}
        onChange={setIsEnabled}
        disabled={!status}
      />
    </Column>
  );
}

function PrinterControls({
  status,
  setIsEnabled,
  requestPrintNow,
}: {
  status?: StatusMessages['printer'];
  setIsEnabled: (isEnabled: boolean) => void;
  requestPrintNow: () => void;
}): JSX.Element {
  return (
    <Column gap="0.5rem">
      <Column>
        <H6>
          <Icons.Print /> Printer
        </H6>
        {status?.statusMessage && (
          <Caption
            style={{
              flexGrow: 1,
              overflowWrap: 'anywhere',
              maxHeight: '2rem',
              overflow: 'hidden',
            }}
          >
            <Small>{status?.statusMessage}</Small>
          </Caption>
        )}
        <Caption style={{ flexGrow: 0 }}>
          <ExtraSmall>
            {status?.updatedAt ? formatTimestamp(status.updatedAt) : 'n/a'}
          </ExtraSmall>
        </Caption>
      </Column>
      <CheckboxButton
        label="Enabled"
        isChecked={status?.taskStatus === 'running'}
        onChange={setIsEnabled}
        disabled={!status}
      />
      <Button
        onPress={requestPrintNow}
        disabled={status?.taskStatus !== 'running'}
      >
        Request Print Now
      </Button>
    </Column>
  );
}

function UsbDriveControls({
  status,
  setIsEnabled,
}: {
  status?: StatusMessages['usbDrive'];
  setIsEnabled: (isEnabled: boolean) => void;
}): JSX.Element {
  return (
    <Column gap="0.5rem">
      <Column>
        <H6>
          <Icons.UsbDrive /> USB Drive
        </H6>
        {status?.statusMessage && (
          <Caption
            style={{
              flexGrow: 1,
              overflowWrap: 'anywhere',
              maxHeight: '2rem',
              overflow: 'hidden',
            }}
          >
            <Small>{status?.statusMessage}</Small>
          </Caption>
        )}
        {status?.updatedAt && (
          <Caption style={{ flexGrow: 0 }}>
            <ExtraSmall>{formatTimestamp(status.updatedAt)}</ExtraSmall>
          </Caption>
        )}
      </Column>
      <CheckboxButton
        label="Enabled"
        isChecked={status?.taskStatus === 'running'}
        onChange={setIsEnabled}
        disabled={!status}
      />
    </Column>
  );
}

function AudioControls({
  isSpeakerEnabled,
  setIsSpeakerEnabled,
  isHeadphonesEnabled,
  setIsHeadphonesEnabled,
}: {
  isSpeakerEnabled: boolean;
  setIsSpeakerEnabled: (isEnabled: boolean) => void;
  isHeadphonesEnabled: boolean;
  setIsHeadphonesEnabled: (isEnabled: boolean) => void;
}): JSX.Element {
  return (
    <Column gap="0.5rem">
      <Column>
        <H6>
          {isSpeakerEnabled || isHeadphonesEnabled ? (
            <Icons.VolumeUp />
          ) : (
            <Icons.VolumeMute />
          )}{' '}
          Audio
        </H6>
        <Caption style={{ flexGrow: 1 }}>
          {isSpeakerEnabled ? 'Enabled' : 'Disabled'}
        </Caption>
      </Column>
      <CheckboxButton
        label="Speaker"
        isChecked={isSpeakerEnabled}
        onChange={setIsSpeakerEnabled}
      />
      <CheckboxButton
        label="Headphones"
        isChecked={isHeadphonesEnabled}
        onChange={setIsHeadphonesEnabled}
      />
    </Column>
  );
}

function InputControls(): JSX.Element {
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

  return (
    <Column gap="0.5rem">
      <Column>
        <H6>
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
    </Column>
  );
}

function ScannedSheetImage({
  url,
  label,
}: {
  url?: string;
  label?: React.ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        flexGrow: 1,
        backgroundColor: '#ccc',
        backgroundImage: url && `url(${url})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        minHeight: '80%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div>{url ? ' ' : label}</div>
    </div>
  );
}

function ScannedSheetImages({ urls }: { urls?: SheetOf<string> }): JSX.Element {
  const [top, bottom] = urls ?? [];
  return (
    <Row gap="2rem" style={{ height: '100%', flexGrow: 3 }}>
      <ScannedSheetImage url={top} label="Top" />
      <ScannedSheetImage url={bottom} label="Bottom" />
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
  const setScannerTaskModeMutation = api.setScannerTaskMode.useMutation();
  const getLatestScannedSheetQuery = api.getLatestScannedSheet.useQuery();
  const resetLastPrintedAtMutation = api.resetLastPrintedAt.useMutation();
  const powerDownMutation = api.systemCallApi.powerDown.useMutation();

  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [headphonesEnabled, setHeadphonesEnabled] = useState(true);

  const playSoundHeadphones = useSound('success');
  const playSoundSpeaker = api.playSound.useMutation().mutate;

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
        <Column center style={{ width: '80%' }}>
          <Row gap="2rem" style={{ flexGrow: 1, maxHeight: '70%' }}>
            <Column gap="2rem" style={{ flexGrow: 1 }}>
              <CardReaderControls
                status={cardStatus}
                setIsEnabled={(isEnabled) =>
                  setCardReaderTaskRunningMutation.mutate(isEnabled)
                }
              />
              <UsbDriveControls
                status={usbDriveStatus}
                setIsEnabled={(isEnabled) =>
                  setUsbDriveTaskRunningMutation.mutate(isEnabled)
                }
              />
              <AudioControls
                isSpeakerEnabled={speakerEnabled}
                setIsSpeakerEnabled={setSpeakerEnabled}
                isHeadphonesEnabled={headphonesEnabled}
                setIsHeadphonesEnabled={setHeadphonesEnabled}
              />
              <InputControls />
            </Column>
            <Column gap="2rem" style={{ flexGrow: 1 }}>
              <ScannerControls
                status={scannerStatus}
                setScanningMode={(mode) =>
                  setScannerTaskModeMutation.mutate(mode)
                }
              />
              <PrinterControls
                status={printerStatus}
                setIsEnabled={(isEnabled) =>
                  setPrinterTaskRunningMutation.mutate(isEnabled)
                }
                requestPrintNow={() => resetLastPrintedAtMutation.mutate()}
              />
            </Column>
            <ScannedSheetImages
              urls={getLatestScannedSheetQuery.data ?? undefined}
            />
          </Row>
          <Row gap="1rem" center style={{ height: '200px' }}>
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
      </Main>
    </Screen>
  );
}

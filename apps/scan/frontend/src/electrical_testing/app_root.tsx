import {
  Button,
  Caption,
  CheckboxButton,
  CpuMetricsDisplay,
  ExportLogsModal,
  H6,
  Icons,
  InputControls,
  Main,
  RadioGroup,
  Screen,
  SignedHashValidationButton,
  HeadphoneCalibrationButton,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { DateTime } from 'luxon';
import React from 'react';
import styled from 'styled-components';
import useInterval from 'use-interval';
import { iter } from '@votingworks/basics';
import { mapSheet, SheetOf } from '@votingworks/types';
import type { HWTA } from '@votingworks/scan-backend';
import { useSoundControls } from '../utils/use_sound';
import * as api from './api';
import { useApiClient } from './api';

const SOUND_INTERVAL_SECONDS = 5;

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

const LabelContainer = styled.legend`
  display: block;
  margin-bottom: 0;
  font-size: ${(p) => p.theme.sizeMode !== 'desktop' && '0.75rem'};
  font-weight: ${(p) => p.theme.sizes.fontWeight.semiBold};
`;

const StatTable = styled.table`
  font-size: 0.8rem;
  margin-top: 0.5rem;

  th {
    text-align: left;
  }

  td {
    padding: 0.3em;
  }

  td:first-child {
    font-weight: bold;
  }
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

function formatRadiansAsDegrees(radians: number): string {
  return `${((radians / Math.PI) * 180).toFixed(2)}°`;
}

type StatusMessages = Awaited<
  ReturnType<api.ApiClient['getElectricalTestingStatuses']>
>;

function ScannerControls({
  status,
  sessionSheetCount,
  sessionStats,
  latestSheet,
  setScanningMode,
  onResetScanningSession,
}: {
  status: StatusMessages['scanner'];
  sessionSheetCount: number;
  sessionStats: HWTA.ScanningSessionData['stats'];
  latestSheet?: HWTA.ScanningSessionData['sheets'][number];
  setScanningMode: (scanningMode: HWTA.ScanningMode) => void;
  onResetScanningSession: () => void;
}): JSX.Element {
  return (
    <Column gap="1rem">
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
      <div>
        <LabelContainer>Last scan</LabelContainer>
        <StatTable>
          <thead>
            <tr>
              <th />
              <th>Top</th>
              <th>Bottom</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              if (!latestSheet) {
                return (
                  <React.Fragment>
                    <tr>
                      <td>Top Error</td>
                      <td>n/a</td>
                      <td>n/a</td>
                    </tr>
                    <tr>
                      <td>Horizontal Alignment Error</td>
                      <td>n/a</td>
                      <td>n/a</td>
                    </tr>
                    <tr>
                      <td>Average Error</td>
                      <td>n/a</td>
                      <td>n/a</td>
                    </tr>
                  </React.Fragment>
                );
              }
              const [top, bottom] = latestSheet;
              return (
                <React.Fragment>
                  <tr>
                    <td>Top Error</td>
                    <td>{formatRadiansAsDegrees(top.analysis.topError)}</td>
                    <td>{formatRadiansAsDegrees(bottom.analysis.topError)}</td>
                  </tr>
                  <tr>
                    <td>Horizontal Alignment Error</td>
                    <td>
                      {formatRadiansAsDegrees(
                        top.analysis.horizontalAlignmentError
                      )}
                    </td>
                    <td>
                      {formatRadiansAsDegrees(
                        bottom.analysis.horizontalAlignmentError
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>Average Error</td>
                    <td>{formatRadiansAsDegrees(top.analysis.averageError)}</td>
                    <td>
                      {formatRadiansAsDegrees(bottom.analysis.averageError)}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })()}
          </tbody>
        </StatTable>
      </div>
      <div>
        <LabelContainer>
          Session stats ({format.count(sessionSheetCount)} sheets)
        </LabelContainer>
        <StatTable>
          <thead>
            <tr>
              <th />
              <th>Mean</th>
              <th>Median</th>
              <th>Stddev</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Top Error</td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.topError.mean)
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.topError.median)
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.topError.stddev)
                  : 'n/a'}
              </td>
            </tr>
            <tr>
              <td>Horizontal Alignment Error</td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(
                      sessionStats.horizontalAlignmentError.mean
                    )
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(
                      sessionStats.horizontalAlignmentError.median
                    )
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(
                      sessionStats.horizontalAlignmentError.stddev
                    )
                  : 'n/a'}
              </td>
            </tr>
            <tr>
              <td>Average Error</td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.averageError.mean)
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.averageError.median)
                  : 'n/a'}
              </td>
              <td>
                {sessionStats
                  ? formatRadiansAsDegrees(sessionStats.averageError.stddev)
                  : 'n/a'}
              </td>
            </tr>
          </tbody>
        </StatTable>
      </div>

      <Button onPress={onResetScanningSession}>Reset Session</Button>
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
        Print Now
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

function AudioControls(): JSX.Element {
  const [enabled, setEnabled] = React.useState(true);
  const [calibrating, setCalibrating] = React.useState(false);
  const [output, setOutput] = React.useState<'Headphones' | 'Speaker'>(
    'Speaker'
  );

  const headphonesSuccess = useSoundControls('success');
  const playSoundSpeaker = api.playSound.useMutation().mutate;

  useInterval(
    () => {
      if (calibrating) return;

      if (output === 'Speaker') {
        setOutput('Headphones');
        headphonesSuccess.play();
      } else {
        setOutput('Speaker');
        playSoundSpeaker({ name: 'success' });
      }
    },
    enabled ? SOUND_INTERVAL_SECONDS * 1000 : null
  );

  const EnabledIcon =
    output === 'Headphones' ? Icons.Headphones : Icons.VolumeUp;

  return (
    <Column gap="0.5rem">
      <Column>
        <H6>{enabled ? <EnabledIcon /> : <Icons.VolumeMute />} Audio</H6>
        <Caption style={{ flexGrow: 1 }}>
          {enabled ? (
            <React.Fragment>Output: {output}</React.Fragment>
          ) : (
            'Disabled'
          )}
        </Caption>
      </Column>
      <CheckboxButton
        label="Enabled"
        isChecked={enabled}
        onChange={(enable) => {
          headphonesSuccess.stop();
          setEnabled(enable);
        }}
      />

      <Row>
        <HeadphoneCalibrationButton
          audioUrl="/sounds/tts-sample.mp3"
          onBegin={() => {
            headphonesSuccess.stop();
            setCalibrating(true);
          }}
          onEnd={() => setCalibrating(false)}
        />
      </Row>
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
  const apiClient = useApiClient();
  const getElectricalTestingStatusMessagesQuery =
    api.getElectricalTestingStatuses.useQuery();
  const getCpuMetricsQuery = api.getCpuMetrics.useQuery();
  const setCardReaderTaskRunningMutation =
    api.setCardReaderTaskRunning.useMutation();
  const setUsbDriveTaskRunningMutation =
    api.setUsbDriveTaskRunning.useMutation();
  const setPrinterTaskRunningMutation = api.setPrinterTaskRunning.useMutation();
  const setScannerTaskModeMutation = api.setScannerTaskMode.useMutation();
  const resetLastPrintedAtMutation = api.resetLastPrintedAt.useMutation();
  const getCurrentScanningSessionDataQuery =
    api.getCurrentScanningSessionData.useQuery();
  const resetScanningSessionMutation = api.resetScanningSession.useMutation();
  const powerDownMutation = api.systemCallApi.powerDown.useMutation();

  function powerDown() {
    powerDownMutation.mutate();
  }

  function setScanningMode(mode: HWTA.ScanningMode) {
    setScannerTaskModeMutation.mutate(mode);
  }

  function resetScanningSession() {
    resetScanningSessionMutation.mutate();
  }

  const [isSaveLogsModalOpen, setIsSaveLogsModalOpen] = React.useState(false);

  const cardStatus = getElectricalTestingStatusMessagesQuery.data?.card;
  const usbDriveStatus = getElectricalTestingStatusMessagesQuery.data?.usbDrive;
  const printerStatus = getElectricalTestingStatusMessagesQuery.data?.printer;
  const scannerStatus = getElectricalTestingStatusMessagesQuery.data?.scanner;
  const latestScannedSheet = iter(
    getCurrentScanningSessionDataQuery.data?.sheets
  ).last();

  return (
    <Screen>
      <CpuMetricsDisplay metrics={getCpuMetricsQuery.data} />
      <Main centerChild style={{ paddingTop: '70px' }}>
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
              <AudioControls />
              <Column gap="0.5rem">
                <Column>
                  <H6>
                    <Icons.Mouse /> Inputs
                  </H6>
                  <Caption style={{ flexGrow: 1 }}>
                    <InputControls />
                  </Caption>
                </Column>
              </Column>
              <PrinterControls
                status={printerStatus}
                setIsEnabled={(isEnabled) =>
                  setPrinterTaskRunningMutation.mutate(isEnabled)
                }
                requestPrintNow={() => resetLastPrintedAtMutation.mutate()}
              />
            </Column>
            <Column gap="2rem" style={{ flexGrow: 1 }}>
              <ScannerControls
                status={scannerStatus}
                sessionSheetCount={
                  getCurrentScanningSessionDataQuery.data?.sheets.length ?? 0
                }
                sessionStats={getCurrentScanningSessionDataQuery.data?.stats}
                latestSheet={latestScannedSheet}
                setScanningMode={setScanningMode}
                onResetScanningSession={resetScanningSession}
              />
            </Column>
            <ScannedSheetImages
              urls={
                latestScannedSheet &&
                mapSheet(latestScannedSheet, ({ path }) => path)
              }
            />
          </Row>
          <Row gap="1rem" center style={{ height: '200px' }}>
            <SignedHashValidationButton apiClient={apiClient} />
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

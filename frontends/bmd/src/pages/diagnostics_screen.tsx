import React, { useCallback, useEffect, useState } from 'react';
import {
  Devices,
  Screen,
  Main,
  MainChild,
  Prose,
  Button,
  Text,
} from '@votingworks/ui';
import { ElectionDefinition, PrecinctSelection } from '@votingworks/types';
import assert from 'assert';
import { formatTime, Hardware } from '@votingworks/utils';
import { DateTime } from 'luxon';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { VersionsData } from '../components/versions_data';
import { MachineConfig } from '../config/types';

/**
 * IPP printer-state-reasons explain what's going on with a printer in detail.
 * Here, we map them to a human-readable explanation, both for user-friendliness
 * and developer documentation.
 * Spec: https://datatracker.ietf.org/doc/html/rfc2911#section-4.4.12
 * There are more possible reasons than covered in the spec, so this list is not
 * exhaustive.
 *
 * Note that the actual printer-state-reasons sent by the printer may have a
 * suffix of either: "-report", "-warning", or "-error" (e.g. "media-jam-error").
 */
const IppPrinterStateReasonMessage: { [reason: string]: string } = {
  'sleep-mode': 'The printer is in sleep mode.', // Custom reason added by us
  none: 'The printer is ready.',
  'media-needed': 'The printer is out of paper.',
  'media-jam': 'The printer has a paper jam.',
  'moving-to-paused': 'The printer is pausing.',
  paused: 'The printer is paused',
  shutdown: 'The printer is turned off or disconnected.',
  'timed-out': 'The printer is not responding.',
  stopping: 'The printer is stopping.',
  'stopped-partly': 'The printer is stopped.',
  'toner-low': 'The printer is low on toner.',
  'toner-empty': 'The printer is out of toner.',
  'spool-area-full': 'The spool area is full.',
  'cover-open': "The printer's cover is open.",
  'interlock-open': "The printer's interlock device is open.",
  'door-open': "The printer's door is open.",
  'input-tray-missing': "The printer's input tray is missing.",
  'media-low': 'The printer is low on paper.',
  'media-empty': 'The printer is out of paper.',
  'output-tray-missing': "The printer's output tray is missing.",
  'output-area-almost-full': "The printer's output tray is almost full.",
  'output-area-full': "The printer's output tray is full.",
  'marker-supply-low': 'The printer is low on ink.',
  'marker-supply-empty': 'The printer is out of ink.',
  'marker-waste-almost-full':
    "The printer's ink waste receptacle is almost full.",
  'marker-waste-full': "The printer's ink waste receptacle is full.",
  'fuser-over-temp': "The printer's fuser temperature is above normal.",
  'fuser-under-temp': "The printer's fuser temperature is below normal.",
  'opc-near-eol': "The printer's optical photo conductor is near end of life.",
  'opc-life-over':
    "The printer's optical photo conductor is no longer functioning.",
  'developer-low': 'The printer is low on developer.',
  'developer-empty': 'The printer is out of developer.',
  'interpreter-resource-unavailable': 'An interpreter resource is unavailable.',
};

export function prettyPrinterStateReasons(
  printerStateReasons: string[]
): string {
  // To make life simpler, just show the highest priority reason
  const [bestReason, bestReasonLevel] =
    printerStateReasons
      .map((printerStateReason) =>
        Array.from(
          /^([a-z-]+?)(?:-(report|warning|error))?$/.exec(printerStateReason) ||
            []
        ).slice(1)
      )
      .sort(([, level1], [, level2]) => {
        function levelRank(level?: string) {
          return level === 'error' ? 0 : level === 'warning' ? 1 : 2;
        }
        return levelRank(level1) - levelRank(level2);
      })
      .pop() || [];

  const prettyReason =
    (bestReason && IppPrinterStateReasonMessage[bestReason]) ??
    bestReason ??
    '';
  const prettyLevel = {
    warning: 'Warning: ',
    error: 'Error: ',
    report: '',
  }[bestReasonLevel || 'report'];
  return `${prettyLevel}${prettyReason}`;
}

interface PrinterStatusProps {
  connectedPrinter: KioskBrowser.PrinterInfo;
  hardware: Hardware;
}

type PrinterStatusState =
  | { isLoading: true }
  | {
      isLoading: false;
      printer?: KioskBrowser.PrinterInfo;
      loadedAt: DateTime;
    };

function PrinterStatus({ connectedPrinter, hardware }: PrinterStatusProps) {
  const [printerStatus, setPrinterStatus] = useState<PrinterStatusState>({
    isLoading: true,
  });

  // devices.printer only updates when the printer connects/disconnects. We want
  // to load its current status, since it may have changed (e.g. if it ran out
  // of paper).
  const loadPrinterStatus = useCallback(
    async () => {
      setPrinterStatus({ isLoading: true });
      const printer = await hardware.readPrinterStatus();
      setPrinterStatus({ isLoading: false, printer, loadedAt: DateTime.now() });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hardware, connectedPrinter]
  );

  useEffect(() => {
    void loadPrinterStatus();
  }, [loadPrinterStatus]);

  if (printerStatus.isLoading) {
    return <Text>Loading printer status...</Text>;
  }
  const { printer, loadedAt } = printerStatus;

  return (
    <React.Fragment>
      {!printer || printer.state === null ? (
        <Text warningIcon>Could not get printer status.</Text>
      ) : (
        <React.Fragment>
          <Text
            voteIcon={printer.state !== 'stopped'}
            warningIcon={printer.state === 'stopped'}
          >
            Printer status:{' '}
            {
              {
                idle: 'Ready',
                processing: 'Processing',
                stopped: 'Stopped',
              }[printer.state]
            }
          </Text>
          {printer.stateReasons[0] && printer.stateReasons[0] !== 'none' && (
            <Text>{prettyPrinterStateReasons(printer.stateReasons)}</Text>
          )}
          <Text>
            Toner level:{' '}
            {printer.markerInfos[0] && printer.markerInfos[0].level >= 0
              ? `${printer.markerInfos[0].level}%`
              : 'unknown'}
          </Text>
        </React.Fragment>
      )}
      <div
        style={{ display: 'flex', alignItems: 'baseline', marginTop: '0.5em' }}
      >
        <Button onPress={loadPrinterStatus}>Refresh Printer Status</Button>
        {loadedAt && (
          <div style={{ marginLeft: '0.5em' }}>
            <Text small>Last updated at {formatTime(loadedAt)}</Text>
          </div>
        )}
      </div>
    </React.Fragment>
  );
}

interface DiagnosticsScreenProps {
  hardware: Hardware;
  devices: Devices;
  onBackButtonPress: () => void;
  machineConfig: MachineConfig;
  electionDefinition: ElectionDefinition;
  appPrecinct: PrecinctSelection;
}

export function DiagnosticsScreen({
  hardware,
  devices,
  onBackButtonPress,
  machineConfig,
  electionDefinition,
  appPrecinct,
}: DiagnosticsScreenProps): JSX.Element {
  // Can't get to this screen without having the card reader and printer connected
  assert(devices.cardReader);
  assert(devices.printer);

  const { computer } = devices;

  return (
    <Screen flexDirection="row-reverse" voterMode={false}>
      <Main padded>
        <MainChild>
          <Prose compact>
            <h1>System Diagnostics</h1>
            <h2>Computer</h2>
            <Text warningIcon={computer.batteryIsLow}>
              Battery:{' '}
              {computer.batteryLevel &&
                `${Math.round(computer.batteryLevel * 100)}%`}
              .{' '}
              {computer.batteryIsCharging
                ? 'Power cord connected.'
                : 'No power cord connected.'}
            </Text>
            <h2>Printer</h2>
            <PrinterStatus
              connectedPrinter={devices.printer}
              hardware={hardware}
            />
          </Prose>
        </MainChild>
      </Main>
      <Sidebar
        appName={machineConfig.appMode.productName}
        centerContent
        title="Poll Worker Actions"
        screenReaderInstructions="To navigate through the available actions, use the down arrow."
        footer={
          <React.Fragment>
            <ElectionInfo
              electionDefinition={electionDefinition}
              precinctSelection={appPrecinct}
              horizontal
            />
            <VersionsData
              machineConfig={machineConfig}
              electionHash={electionDefinition.electionHash}
            />
          </React.Fragment>
        }
      >
        <Button onPress={onBackButtonPress}>Back</Button>
      </Sidebar>
    </Screen>
  );
}

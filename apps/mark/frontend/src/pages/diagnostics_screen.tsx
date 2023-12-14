import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  ComputerStatus as ComputerStatusType,
  Devices,
  H1,
  H4,
  LinkButton,
  Main,
  Prose,
  Screen,
  useCancelablePromise,
  P,
  Caption,
  Icons,
} from '@votingworks/ui';
import { formatTime, Hardware } from '@votingworks/utils';
import { DateTime } from 'luxon';
import { useHistory, Switch, Route } from 'react-router-dom';
import styled from 'styled-components';
import { assert, Optional } from '@votingworks/basics';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticResults,
} from './accessible_controller_diagnostic_screen';

const ButtonAndTimestamp = styled.div`
  display: flex;
  align-items: baseline;
  margin-top: 0.5em;

  > button {
    margin-right: 0.5em;
  }
`;

const CHECKBOX_ICON = <Icons.Checkbox color="success" />;

const WARNING_ICON = <Icons.Warning color="warning" />;

interface ComputerStatusProps {
  computer: ComputerStatusType;
}

function ComputerStatus({ computer }: ComputerStatusProps) {
  return (
    <React.Fragment>
      <P>
        {CHECKBOX_ICON} Battery:{' '}
        {computer.batteryLevel && `${Math.round(computer.batteryLevel * 100)}%`}
      </P>
      {computer.batteryIsCharging ? (
        <P>{CHECKBOX_ICON} Power cord connected.</P>
      ) : (
        <P>{WARNING_ICON} No power cord connected. Connect power cord.</P>
      )}
    </React.Fragment>
  );
}

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
  'sleep-mode':
    'The printer is in sleep mode. Press any button on the printer to wake it, then refresh printer status.', // Custom reason added by us
  'media-needed': 'The printer is out of paper. Add paper to the printer.',
  'media-jam': 'The printer has a paper jam. Open cover and remove paper.',
  'moving-to-paused': 'The printer is pausing. Restart the printer.',
  paused: 'The printer is paused. Restart the printer.',
  shutdown: 'The printer is turned off or disconnected. Restart the printer.',
  'timed-out': 'The printer is not responding. Restart the printer.',
  stopping: 'The printer is stopping. Restart the printer.',
  'stopped-partly': 'The printer is stopped. Restart the printer.',
  'toner-low': 'The printer is low on toner. Replace toner cartridge.',
  'toner-empty': 'The printer is low on toner. Replace toner cartridge.',
  'spool-area-full': 'The spool area is full. Restart the printer.',
  'cover-open': "The printer's cover is open. Close the printer's cover.",
  'interlock-open': "The printer's door is open. Close the printer's door.",
  'door-open': "The printer's door is open. Close the printer's door.",
  'input-tray-missing':
    "The printer's input tray is missing. Connect the input tray.",
  'media-low': 'The printer is low on paper. Add paper to the printer.',
  'media-empty': 'The printer is out of paper. Add paper to the printer.',
  'output-tray-missing':
    "The printer's output tray is missing. Connect the output tray.",
  'output-area-almost-full':
    "The printer's output tray is almost full. Remove printed documents.",
  'output-area-full':
    "The printer's output tray is full. Remove printed documents.",
  'marker-supply-low': 'The printer is low on toner. Replace toner cartridge.',
  'marker-supply-empty':
    'The printer is out of toner. Replace toner cartridge.',
  'marker-waste-almost-full':
    "The printer's toner waste cartridge is almost full. Empty the toner waste cartridge.",
  'marker-waste-full':
    "The printer's toner waste receptacle is full. Empty the toner waste cartridge.",
  'fuser-over-temp':
    "The printer's fuser temperature is above normal. Restart the printer.",
  'fuser-under-temp':
    "The printer's fuser temperature is below normal. Restart the printer.",
  'opc-near-eol':
    "The printer's optical photo conductor is near end of life. Replace this printer.",
  'opc-life-over':
    "The printer's optical photo conductor is no longer functioning. Replace this printer.",
};

function parseHighestPriorityReason(
  printerStateReasons: string[]
): Optional<string> {
  return printerStateReasons
    .map((printerStateReason) => {
      const [, reason, level] = Array.from(
        /^([a-z-]+?)(?:-(report|warning|error))?$/.exec(printerStateReason) ||
          []
      );
      return [reason, level];
    })
    .filter(([reason]) => reason)
    .sort(([, level1], [, level2]) => {
      function levelRank(level?: string) {
        return level === 'error' ? 0 : level === 'warning' ? 1 : 2;
      }
      return levelRank(level1) - levelRank(level2);
    })
    .map(([reason]) => reason)[0];
}

interface PrinterStatusProps {
  hardware: Hardware;
}

type PrinterStatusState =
  | { isLoading: true }
  | {
      isLoading: false;
      printer?: KioskBrowser.PrinterInfo;
      loadedAt: DateTime;
    };

function PrinterStatus({ hardware }: PrinterStatusProps) {
  const makeCancelable = useCancelablePromise();
  const [printerStatus, setPrinterStatus] = useState<PrinterStatusState>({
    isLoading: true,
  });

  // devices.printer only updates when the printer connects/disconnects. We want
  // to load its current status, since it may have changed (e.g. if it ran out
  // of paper).
  const loadPrinterStatus = useCallback(async () => {
    setPrinterStatus({ isLoading: true });
    const printer = await makeCancelable(hardware.readPrinterStatus());
    setPrinterStatus({ isLoading: false, printer, loadedAt: DateTime.now() });
  }, [hardware, makeCancelable]);

  useEffect(() => {
    void loadPrinterStatus();
  }, [loadPrinterStatus]);

  if (printerStatus.isLoading) {
    return <P>Loading printer status…</P>;
  }
  const { printer, loadedAt } = printerStatus;

  const refreshButton = (
    <ButtonAndTimestamp>
      <Button onPress={loadPrinterStatus}>Refresh Printer Status</Button>
      {loadedAt && <Caption>Last updated at {formatTime(loadedAt)}</Caption>}
    </ButtonAndTimestamp>
  );

  if (!printer || printer.state === 'unknown') {
    return (
      <React.Fragment>
        <P>{WARNING_ICON} Could not get printer status.</P>
        {refreshButton}
      </React.Fragment>
    );
  }

  const bestReason = parseHighestPriorityReason(printer.stateReasons);
  const marker = printer.markerInfos[0];
  const markerLow = marker.level <= marker.lowLevel;

  return (
    <React.Fragment>
      <P>
        {printer.state === 'stopped' ? WARNING_ICON : CHECKBOX_ICON} Printer
        status:{' '}
        {
          {
            idle: 'Ready',
            processing: 'Processing',
            stopped: 'Stopped',
          }[printer.state]
        }
      </P>
      {bestReason && bestReason !== 'none' && (
        <P>
          {WARNING_ICON} Warning:{' '}
          {IppPrinterStateReasonMessage[bestReason] ?? bestReason}
        </P>
      )}
      <P>
        {markerLow ? WARNING_ICON : CHECKBOX_ICON} Toner level:{' '}
        {marker && marker.level >= 0 ? `${marker.level}%` : 'Unknown'}
      </P>
      {refreshButton}
    </React.Fragment>
  );
}

interface AccessibleControllerStatusProps {
  accessibleController?: KioskBrowser.Device;
  diagnosticResults?: AccessibleControllerDiagnosticResults;
}

function AccessibleControllerStatus({
  accessibleController,
  diagnosticResults,
}: AccessibleControllerStatusProps) {
  if (!accessibleController) {
    return <P>{WARNING_ICON} No accessible controller connected.</P>;
  }

  return (
    <React.Fragment>
      <P>{CHECKBOX_ICON} Accessible controller connected.</P>
      {diagnosticResults &&
        (diagnosticResults.passed ? (
          <P>{CHECKBOX_ICON} Test passed.</P>
        ) : (
          <P>
            {WARNING_ICON} Test failed: {diagnosticResults.message}
          </P>
        ))}
      <ButtonAndTimestamp>
        <LinkButton to="/accessible-controller">
          Start Accessible Controller Test
        </LinkButton>
        {diagnosticResults && (
          <Caption>
            Last tested at {formatTime(diagnosticResults.completedAt)}
          </Caption>
        )}
      </ButtonAndTimestamp>
    </React.Fragment>
  );
}

export interface DiagnosticsScreenProps {
  hardware: Hardware;
  devices: Devices;
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  hardware,
  devices,
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  // Since we show full-screen alerts for specific hardware states, there are
  // certain cases that we will never see in this screen
  assert(devices.printer);
  assert(
    !(devices.computer.batteryIsLow && !devices.computer.batteryIsCharging)
  );

  const [
    accessibleControllerDiagnosticResults,
    setAccessibleControllerDiagnosticResults,
  ] = useState<AccessibleControllerDiagnosticResults>();
  const history = useHistory();

  return (
    <Switch>
      <Route path="/" exact>
        <Screen>
          <Main padded>
            <Prose compact maxWidth={false}>
              <H1>System Diagnostics</H1>
              <P>
                <Button
                  icon="Previous"
                  variant="primary"
                  onPress={onBackButtonPress}
                >
                  Back to Poll Worker Actions
                </Button>
              </P>
              <span className="screen-reader-only">
                To navigate through the available actions, use the down arrow.
              </span>
              <H4 as="h2">Computer</H4>
              <ComputerStatus computer={devices.computer} />
              <H4 as="h2">Printer</H4>
              <PrinterStatus hardware={hardware} />
              <H4 as="h2">Accessible Controller</H4>
              <AccessibleControllerStatus
                accessibleController={devices.accessibleController}
                diagnosticResults={accessibleControllerDiagnosticResults}
              />
            </Prose>
          </Main>
        </Screen>
      </Route>
      <Route path="/accessible-controller">
        <AccessibleControllerDiagnosticScreen
          onComplete={(results) => {
            setAccessibleControllerDiagnosticResults(results);
            history.push('/');
          }}
          onCancel={() => history.push('/')}
        />
      </Route>
    </Switch>
  );
}

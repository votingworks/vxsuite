import React, { useState } from 'react';
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
  P,
  Caption,
  Icons,
  PrinterStatusDisplay,
} from '@votingworks/ui';
import { formatTime } from '@votingworks/utils';
import { useHistory, Switch, Route } from 'react-router-dom';
import styled from 'styled-components';
import { assert } from '@votingworks/basics';
import { PrinterStatus } from '@votingworks/types';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticResults,
} from './accessible_controller_diagnostic_screen';
import { getPrinterStatus } from '../api';

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
  devices: Devices;
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  devices,
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  // Since we show full-screen alerts for specific hardware states, there are
  // certain cases that we will never see in this screen
  assert(
    !(devices.computer.batteryIsLow && !devices.computer.batteryIsCharging)
  );
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus: PrinterStatus = printerStatusQuery.isSuccess
    ? printerStatusQuery.data
    : { connected: false };

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
              <PrinterStatusDisplay printerStatus={printerStatus} />
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

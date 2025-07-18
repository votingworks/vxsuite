import React, { useState } from 'react';
import {
  Button,
  H1,
  H4,
  LinkButton,
  Main,
  Screen,
  P,
  Caption,
  Icons,
  PrinterStatusDisplay,
} from '@votingworks/ui';
import { formatTime } from '@votingworks/utils';
import { useHistory, Switch, Route } from 'react-router-dom';
import styled from 'styled-components';
import { PrinterStatus } from '@votingworks/types';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticResults,
} from './accessible_controller_diagnostic_screen';
import { getAccessibleControllerConnected, getPrinterStatus } from '../api';

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

interface AccessibleControllerStatusProps {
  accessibleControllerConnected: boolean;
  diagnosticResults?: AccessibleControllerDiagnosticResults;
}

function AccessibleControllerStatus({
  accessibleControllerConnected,
  diagnosticResults,
}: AccessibleControllerStatusProps) {
  if (!accessibleControllerConnected) {
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
  onBackButtonPress: () => void;
}

export function DiagnosticsScreen({
  onBackButtonPress,
}: DiagnosticsScreenProps): JSX.Element {
  const printerStatusQuery = getPrinterStatus.useQuery();
  const printerStatus: PrinterStatus = printerStatusQuery.isSuccess
    ? printerStatusQuery.data
    : { connected: false };
  const accessibleControllerConnectedQuery =
    getAccessibleControllerConnected.useQuery();
  const accessibleControllerConnected = Boolean(
    accessibleControllerConnectedQuery.data
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
            <div>
              <H1>Diagnostics</H1>
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
              <H4 as="h2">Printer</H4>
              <PrinterStatusDisplay printerStatus={printerStatus} />
              <H4 as="h2">Accessible Controller</H4>
              <AccessibleControllerStatus
                accessibleControllerConnected={accessibleControllerConnected}
                diagnosticResults={accessibleControllerDiagnosticResults}
              />
            </div>
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

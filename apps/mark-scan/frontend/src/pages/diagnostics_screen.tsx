import React, { useState } from 'react';
import {
  Button,
  H1,
  H4,
  LinkButton,
  Main,
  Prose,
  Screen,
  P,
  Caption,
  Icons,
} from '@votingworks/ui';
import { formatTime } from '@votingworks/utils';
import { useHistory, Switch, Route } from 'react-router-dom';
import styled from 'styled-components';
import type { BatteryInfo } from '@votingworks/backend';
import {
  AccessibleControllerDiagnosticScreen,
  AccessibleControllerDiagnosticResults,
} from './accessible_controller_diagnostic_screen';
import { systemCallApi } from '../api';

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
  battery?: BatteryInfo;
}

function ComputerStatus({ battery }: ComputerStatusProps) {
  const level = battery ? battery.level : 1;
  const discharging = battery ? battery.discharging : false;

  return (
    <React.Fragment>
      <P>
        {CHECKBOX_ICON} Battery: {`${Math.round(level * 100)}%`}
      </P>
      {!discharging ? (
        <P>{CHECKBOX_ICON} Power cord connected.</P>
      ) : (
        <P>{WARNING_ICON} No power cord connected. Connect power cord.</P>
      )}
    </React.Fragment>
  );
}

interface AccessibleControllerStatusProps {
  diagnosticResults?: AccessibleControllerDiagnosticResults;
}

function AccessibleControllerStatus({
  diagnosticResults,
}: AccessibleControllerStatusProps) {
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
  const batteryQuery = systemCallApi.getBatteryInfo.useQuery();
  const battery = batteryQuery.data ?? undefined;

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
              <ComputerStatus battery={battery} />
              <H4 as="h2">Accessible Controller</H4>
              <AccessibleControllerStatus
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

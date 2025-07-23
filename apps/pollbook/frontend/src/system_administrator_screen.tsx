import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import {
  SystemAdministratorNavScreen,
  systemAdministratorRoutes,
} from './nav_screen';
import { getElection, unconfigure } from './api';
import { Column, Row } from './layout';
import { SmartCardsScreen } from './smart_cards_screen';
import { UnconfiguredSystemAdminScreen } from './unconfigured_screen';
import { SettingsScreen } from './settings_screen';

function SystemAdminSettingsScreen(): JSX.Element | null {
  return (
    <SystemAdministratorNavScreen title="Settings">
      <SettingsScreen showFormatUsbButton />
    </SystemAdministratorNavScreen>
  );
}

export function ElectionScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const unconfigureMutation = unconfigure.useMutation();

  if (!getElectionQuery.isSuccess) {
    return null;
  }

  if (getElectionQuery.data.isErr()) {
    return (
      <SystemAdministratorNavScreen title="Election">
        <UnconfiguredSystemAdminScreen />
      </SystemAdministratorNavScreen>
    );
  }
  const election = getElectionQuery.data.unsafeUnwrap();

  return (
    <SystemAdministratorNavScreen title="Election">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <div data-testid="election-info">
            <Card color="neutral">
              <Row style={{ gap: '1rem', alignItems: 'center' }}>
                <Seal seal={election.seal} maxWidth="7rem" />
                <div>
                  <H2>{election.title}</H2>
                  <P>
                    {election.county.name}, {election.state}
                    <br />
                    {format.localeLongDate(
                      election.date.toMidnightDatetimeWithSystemTimezone()
                    )}
                  </P>
                </div>
              </Row>
            </Card>
          </div>
          <div>
            <UnconfigureMachineButton
              unconfigureMachine={() => unconfigureMutation.mutateAsync()}
              isMachineConfigured
            />
          </div>
        </Column>
      </MainContent>
    </SystemAdministratorNavScreen>
  );
}

export function SystemAdministratorScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.election.path}
        component={ElectionScreen}
      />
      <Route
        path={systemAdministratorRoutes.smartCards.path}
        component={SmartCardsScreen}
      />
      <Route
        path={systemAdministratorRoutes.settings.path}
        component={SystemAdminSettingsScreen}
      />
      <Redirect to={systemAdministratorRoutes.election.path} />
    </Switch>
  );
}

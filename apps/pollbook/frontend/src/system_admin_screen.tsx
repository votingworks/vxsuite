import {
  Card,
  H2,
  MainContent,
  P,
  Seal,
  UnconfigureMachineButton,
} from '@votingworks/ui';
import { assert } from '@votingworks/basics';
import { format } from '@votingworks/utils';
import { Redirect, Route, Switch } from 'react-router-dom';
import { SystemAdminNavScreen, systemAdminRoutes } from './nav_screen';
import { getElection, unconfigure } from './api';
import { Column, FieldName, Row } from './layout';
import { VotersScreen } from './voters_screen';

export function SettingsScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();
  const unconfigureMutation = unconfigure.useMutation();

  assert(getElectionQuery.isSuccess);
  const election = getElectionQuery.data.unsafeUnwrap();

  return (
    <SystemAdminNavScreen title="Settings">
      <MainContent>
        <Column style={{ gap: '1rem' }}>
          <div data-testid="election-info">
            <FieldName>Election</FieldName>
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
    </SystemAdminNavScreen>
  );
}

export function SystemAdminScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdminRoutes.settings.path}
        component={SettingsScreen}
      />
      <Route path={systemAdminRoutes.voters.path} component={VotersScreen} />
      <Redirect to={systemAdminRoutes.settings.path} />
    </Switch>
  );
}

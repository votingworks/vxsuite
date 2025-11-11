import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { Button, P } from '@votingworks/ui';

import { getElectionDefinition, unconfigureMachine } from './api';
import { ScreenWrapper } from './components/screen_wrapper';
import { systemAdministratorRoutes } from './routes';

function SystemAdministratorSettingsScreen(): JSX.Element | null {
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const electionDefinition = electionDefinitionQuery.data;

  return (
    <React.Fragment>
      {electionDefinition ? (
        <Button onPress={unconfigureMachineMutation.mutate}>Unconfigure</Button>
      ) : (
        <P>No election configured</P>
      )}
    </React.Fragment>
  );
}

export function SystemAdministratorApp(): JSX.Element {
  return (
    <ScreenWrapper authType="system_admin">
      <Switch>
        <Route
          path={systemAdministratorRoutes.settings.path}
          render={() => <SystemAdministratorSettingsScreen />}
        />
        <Redirect to={systemAdministratorRoutes.settings.path} />
      </Switch>
    </ScreenWrapper>
  );
}

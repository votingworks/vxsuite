import { Redirect, Route, Switch } from 'react-router-dom';
import { Button } from '@votingworks/ui';

import { getElectionDefinition, unconfigureMachine } from './api';
import { ScreenWrapper } from './components/screen_wrapper';
import { PrintScreen } from './screens/print_screen';
import { TitleBar } from './components/title_bar';
import { electionManagerRoutes } from './routes';

function ElectionManagerElectionScreen(): JSX.Element | null {
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const { election } = electionDefinitionQuery.data || {};

  return (
    <div>
      <TitleBar title="Election" />
      Configured for: <strong>{election?.title || 'None'}</strong>
    </div>
  );
}

function ElectionManagerSettingsScreen(): JSX.Element {
  const unconfigureMachineMutation = unconfigureMachine.useMutation();
  return (
    <TitleBar
      title="Settings"
      actions={
        <Button onPress={unconfigureMachineMutation.mutate}>Unconfigure</Button>
      }
    />
  );
}

export function ElectionManagerApp(): JSX.Element {
  return (
    <ScreenWrapper authType="election_manager">
      <Switch>
        <Route
          path={electionManagerRoutes.print.path}
          render={() => <PrintScreen isElectionManagerAuth />}
        />
        <Route
          exact
          path={electionManagerRoutes.election.path}
          render={() => <ElectionManagerElectionScreen />}
        />
        <Route
          path={electionManagerRoutes.settings.path}
          render={() => <ElectionManagerSettingsScreen />}
        />
        <Redirect to={electionManagerRoutes.election.path} />
      </Switch>
    </ScreenWrapper>
  );
}

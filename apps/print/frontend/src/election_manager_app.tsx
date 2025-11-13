import { Redirect, Route, Switch } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';

import { getElectionDefinition } from './api';
import { ScreenWrapper } from './components/screen_wrapper';
import { PrintScreen } from './screens/print_screen';
import { TitleBar } from './components/title_bar';
import { electionManagerRoutes } from './routes';
import { SettingsScreen } from './screens/settings_screen';

function ElectionManagerElectionScreen(): JSX.Element | null {
  const electionDefinitionQuery = getElectionDefinition.useQuery();
  const { election } = assertDefined(electionDefinitionQuery.data);

  return (
    <div>
      <TitleBar title="Election" />
      Configured for: <strong>{election.title}</strong>
    </div>
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
          render={() => <SettingsScreen />}
        />
        <Redirect to={electionManagerRoutes.election.path} />
      </Switch>
    </ScreenWrapper>
  );
}

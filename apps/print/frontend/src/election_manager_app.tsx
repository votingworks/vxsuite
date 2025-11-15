import { Redirect, Route, Switch } from 'react-router-dom';
import { assertDefined } from '@votingworks/basics';

import { getElectionRecord } from './api';
import { ScreenWrapper } from './components/screen_wrapper';
import { PrintScreen } from './screens/print_screen';
import { TitleBar } from './components/title_bar';
import { electionManagerRoutes } from './routes';
import { SettingsScreen } from './screens/settings_screen';

function ElectionManagerElectionScreen(): JSX.Element | null {
  const electionRecordQuery = getElectionRecord.useQuery();
  if (!electionRecordQuery.isSuccess) {
    return null;
  }
  const {
    electionDefinition: { election },
  } = assertDefined(electionRecordQuery.data);
  return (
    <div>
      <TitleBar title="Election" />
      Configured for: <strong>{election.title}</strong>
    </div>
  );
}

export function ElectionManagerApp(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.print.path}
        render={() => (
          <ScreenWrapper authType="election_manager">
            <PrintScreen isElectionManagerAuth />
          </ScreenWrapper>
        )}
      />
      <Route
        exact
        path={electionManagerRoutes.election.path}
        render={() => (
          <ScreenWrapper authType="election_manager">
            <ElectionManagerElectionScreen />
          </ScreenWrapper>
        )}
      />
      <Route
        path={electionManagerRoutes.settings.path}
        render={() => (
          <ScreenWrapper authType="election_manager">
            <SettingsScreen />
          </ScreenWrapper>
        )}
      />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}

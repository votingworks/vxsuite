import { Redirect, Route, Switch } from 'react-router-dom';
import { StatisticsScreen } from './statistics_screen.js';
import { ElectionManagerVotersScreen } from './voters_screen.js';
import { VoterDetailsScreen } from './voter_details_screen.js';
import { VoterRegistrationScreen } from './voter_registration_screen.js';
import { ElectionManagerNavScreen, electionManagerRoutes } from './nav_screen.js';
import { SettingsScreen } from './settings_screen.js';
import { ElectionScreen } from './election_screen.js';

function ElectionManagerElectionScreen(): JSX.Element | null {
  return (
    <ElectionManagerNavScreen title="Election">
      <ElectionScreen />
    </ElectionManagerNavScreen>
  );
}

function ElectionManagerSettingsScreen(): JSX.Element {
  return (
    <ElectionManagerNavScreen title="Settings">
      <SettingsScreen showFormatUsbButton={false} />{' '}
    </ElectionManagerNavScreen>
  );
}

export function ElectionManagerScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={electionManagerRoutes.election.path}
        render={() => <ElectionManagerElectionScreen />}
      />
      <Route
        exact
        path={electionManagerRoutes.voters.path}
        component={ElectionManagerVotersScreen}
      />
      <Route
        path={electionManagerRoutes.addVoter.path}
        component={VoterRegistrationScreen}
      />
      <Route
        path={electionManagerRoutes.statistics.path}
        component={StatisticsScreen}
      />
      <Route
        path={electionManagerRoutes.settings.path}
        component={ElectionManagerSettingsScreen}
      />
      <Route path="/voters/:voterId" component={VoterDetailsScreen} />
      <Redirect to={electionManagerRoutes.election.path} />
    </Switch>
  );
}

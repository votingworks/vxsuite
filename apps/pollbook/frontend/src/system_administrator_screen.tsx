import { Redirect, Route, Switch } from 'react-router-dom';
import {
  SystemAdministratorNavScreen,
  systemAdministratorRoutes,
} from './nav_screen.js';
import { SmartCardsScreen } from './smart_cards_screen.js';
import { SettingsScreen } from './settings_screen.js';
import { ElectionScreen } from './election_screen.js';
import { UnconfiguredSystemAdminScreen } from './unconfigured_screen.js';
import { getElection } from './api.js';

function SystemAdminSettingsScreen(): JSX.Element | null {
  return (
    <SystemAdministratorNavScreen title="Settings">
      <SettingsScreen showFormatUsbButton />
    </SystemAdministratorNavScreen>
  );
}

function SystemAdministratorElectionScreen(): JSX.Element | null {
  const getElectionQuery = getElection.useQuery();

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

  return (
    <SystemAdministratorNavScreen title="Election">
      <ElectionScreen />
    </SystemAdministratorNavScreen>
  );
}

export function SystemAdministratorScreen(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.election.path}
        component={SystemAdministratorElectionScreen}
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

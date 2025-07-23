import { Redirect, Route, Switch } from 'react-router-dom';
import {
  SystemAdministratorNavScreen,
  systemAdministratorRoutes,
} from './nav_screen';
import { SmartCardsScreen } from './smart_cards_screen';
import { SettingsScreen } from './settings_screen';
import { ElectionScreen } from './election_screen';

function SystemAdminSettingsScreen(): JSX.Element | null {
  return (
    <SystemAdministratorNavScreen title="Settings">
      <SettingsScreen showFormatUsbButton />
    </SystemAdministratorNavScreen>
  );
}

function SystemAdministratorElectionScreen(): JSX.Element | null {
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

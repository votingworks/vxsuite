import { Redirect, Route, Switch } from 'react-router-dom';

import { systemAdministratorRoutes } from './routes';
import { DiagnosticsScreen } from './screens/diagnostics_screen';
import { SettingsScreen } from './screens/settings_screen';

export function SystemAdministratorApp(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.diagnostics.path}
        render={() => <DiagnosticsScreen authType="system_admin" />}
      />
      <Route
        path={systemAdministratorRoutes.settings.path}
        render={() => <SettingsScreen isSystemAdminAuth />}
      />
      <Redirect to={systemAdministratorRoutes.settings.path} />
    </Switch>
  );
}

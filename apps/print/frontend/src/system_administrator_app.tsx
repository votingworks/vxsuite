import { Redirect, Route, Switch } from 'react-router-dom';

import { ScreenWrapper } from './components/screen_wrapper';
import { systemAdministratorRoutes } from './routes';
import { SettingsScreen } from './screens/settings_screen';

export function SystemAdministratorApp(): JSX.Element {
  return (
    <Switch>
      <Route
        path={systemAdministratorRoutes.settings.path}
        render={() => (
          <ScreenWrapper authType="system_admin">
            <SettingsScreen includeToggleUsbPortsButton />
          </ScreenWrapper>
        )}
      />
      <Redirect to={systemAdministratorRoutes.settings.path} />
    </Switch>
  );
}

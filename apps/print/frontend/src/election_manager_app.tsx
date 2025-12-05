import { Redirect, Route, Switch } from 'react-router-dom';

import React from 'react';
import { ScreenWrapper } from './components/screen_wrapper';
import { PrintScreen } from './screens/print_screen';
import { SettingsScreen } from './screens/settings_screen';
import { ReportScreen } from './screens/report_screen';
import { ElectionScreen } from './screens/election_screen';
import { electionManagerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';

export function ElectionManagerApp(): JSX.Element {
  return (
    <React.Fragment>
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
          path={electionManagerRoutes.reports.path}
          render={() => (
            <ScreenWrapper authType="election_manager">
              <ReportScreen />
            </ScreenWrapper>
          )}
        />
        <Route
          exact
          path={electionManagerRoutes.election.path}
          render={() => (
            <ScreenWrapper authType="election_manager">
              <ElectionScreen />
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
      <PrinterAlertWrapper />
    </React.Fragment>
  );
}

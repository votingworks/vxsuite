import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

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
          render={() => <PrintScreen isElectionManagerAuth />}
        />
        <Route
          path={electionManagerRoutes.reports.path}
          render={() => <ReportScreen isElectionManagerAuth />}
        />
        <Route
          exact
          path={electionManagerRoutes.election.path}
          render={() => <ElectionScreen />}
        />
        <Route
          path={electionManagerRoutes.settings.path}
          render={() => <SettingsScreen />}
        />
        <Redirect to={electionManagerRoutes.election.path} />
      </Switch>
      <PrinterAlertWrapper />
    </React.Fragment>
  );
}

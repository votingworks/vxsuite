import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

import { PrintScreen } from './screens/print_screen.js';
import { TestDeckScreen } from './screens/test_deck_screen.js';
import { SettingsScreen } from './screens/settings_screen.js';
import { ReportScreen } from './screens/report_screen.js';
import { ElectionScreen } from './screens/election_screen.js';
import { DiagnosticsScreen } from './screens/diagnostics_screen.js';
import { electionManagerRoutes } from './routes.js';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper.js';
import { getElectionRecord, getPollingPlaceId } from './api.js';

export function ElectionManagerApp(): JSX.Element | null {
  const electionRecordQuery = getElectionRecord.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();

  if (!electionRecordQuery.isSuccess || !pollingPlaceIdQuery.isSuccess) {
    return null;
  }

  const locationConfigured = pollingPlaceIdQuery.data !== null;
  const isMachineConfigured =
    electionRecordQuery.data !== null && locationConfigured;

  return (
    <React.Fragment>
      <Switch>
        <Route
          path={electionManagerRoutes.testDecks.path}
          render={() => <TestDeckScreen />}
        />
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
          path={electionManagerRoutes.diagnostics.path}
          render={() => <DiagnosticsScreen authType="election_manager" />}
        />
        <Route
          path={electionManagerRoutes.settings.path}
          render={() => <SettingsScreen />}
        />
        <Redirect
          to={
            isMachineConfigured
              ? electionManagerRoutes.print.path
              : electionManagerRoutes.election.path
          }
        />
      </Switch>
      <PrinterAlertWrapper />
    </React.Fragment>
  );
}

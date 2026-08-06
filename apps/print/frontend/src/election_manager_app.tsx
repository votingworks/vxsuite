import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

import { PrintScreen } from './screens/print_screen';
import { TestDeckScreen } from './screens/test_deck_screen';
import { SettingsScreen } from './screens/settings_screen';
import { ReportScreen } from './screens/report_screen';
import { ElectionScreen } from './screens/election_screen';
import { DiagnosticsScreen } from './screens/diagnostics_screen';
import { electionManagerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';
import { getElectionRecord, getPollingPlaceId } from './api';

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
          // @coverage-defer
          render={() => <TestDeckScreen />}
        />
        <Route
          path={electionManagerRoutes.print.path}
          // @coverage-defer
          render={() => <PrintScreen isElectionManagerAuth />}
        />
        <Route
          path={electionManagerRoutes.reports.path}
          // @coverage-defer
          render={() => <ReportScreen isElectionManagerAuth />}
        />
        <Route
          exact
          path={electionManagerRoutes.election.path}
          render={() => <ElectionScreen />}
        />
        <Route
          path={electionManagerRoutes.diagnostics.path}
          // @coverage-defer
          render={() => <DiagnosticsScreen authType="election_manager" />}
        />
        <Route
          path={electionManagerRoutes.settings.path}
          // @coverage-defer
          render={() => <SettingsScreen />}
        />
        <Redirect
          to={
            // @coverage-defer
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

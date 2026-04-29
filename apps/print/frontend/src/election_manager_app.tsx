import React from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';

import {
  BooleanEnvironmentVariableName as Feature,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { PrintScreen } from './screens/print_screen';
import { SettingsScreen } from './screens/settings_screen';
import { ReportScreen } from './screens/report_screen';
import { ElectionScreen } from './screens/election_screen';
import { DiagnosticsScreen } from './screens/diagnostics_screen';
import { electionManagerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';
import {
  getElectionRecord,
  getPollingPlaceId,
  getPrecinctSelection,
} from './api';

export function ElectionManagerApp(): JSX.Element | null {
  const electionRecordQuery = getElectionRecord.useQuery();
  const precinctSelectionQuery = getPrecinctSelection.useQuery();
  const pollingPlaceIdQuery = getPollingPlaceId.useQuery();

  if (
    !electionRecordQuery.isSuccess ||
    !precinctSelectionQuery.isSuccess ||
    !pollingPlaceIdQuery.isSuccess
  ) {
    return null;
  }

  const locationConfigured = isFeatureFlagEnabled(Feature.ENABLE_POLLING_PLACES)
    ? pollingPlaceIdQuery.data !== null
    : precinctSelectionQuery.data !== null;

  const isMachineConfigured =
    electionRecordQuery.data !== null && locationConfigured;

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

import { Redirect, Route, Switch } from 'react-router-dom';
import React from 'react';
import { PrintScreen } from './screens/print_screen.js';
import { ReportScreen } from './screens/report_screen.js';
import { pollWorkerRoutes } from './routes.js';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper.js';

export function PollWorkerApp(): JSX.Element {
  return (
    <React.Fragment>
      <Switch>
        <Route
          path={pollWorkerRoutes.print.path}
          render={() => <PrintScreen />}
        />
        <Route
          path={pollWorkerRoutes.reports.path}
          render={() => <ReportScreen />}
        />
        <Redirect to={pollWorkerRoutes.print.path} />
      </Switch>
      <PrinterAlertWrapper />
    </React.Fragment>
  );
}

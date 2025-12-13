import { Redirect, Route, Switch } from 'react-router-dom';
import React from 'react';
import { PrintScreen } from './screens/print_screen';
import { ReportScreen } from './screens/report_screen';
import { pollWorkerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';

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

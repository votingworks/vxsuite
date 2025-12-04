import { Redirect, Route, Switch } from 'react-router-dom';
import { PrintScreen } from './screens/print_screen';
import { ReportScreen } from './screens/report_screen';
import { ScreenWrapper } from './components/screen_wrapper';
import { pollWorkerRoutes } from './routes';
import { PrinterAlertWrapper } from './components/printer_alert_wrapper';

export function PollWorkerApp(): JSX.Element {
  return (
    <Switch>
      <Route
        path={pollWorkerRoutes.print.path}
        render={() => (
          <ScreenWrapper authType="poll_worker">
            <PrintScreen isElectionManagerAuth={false} />
          </ScreenWrapper>
        )}
      />
      <Route
        path={pollWorkerRoutes.reports.path}
        render={() => (
          <ScreenWrapper authType="poll_worker">
            <ReportScreen />
          </ScreenWrapper>
        )}
      />
      <Redirect to={pollWorkerRoutes.print.path} />
      <PrinterAlertWrapper />
    </Switch>
  );
}

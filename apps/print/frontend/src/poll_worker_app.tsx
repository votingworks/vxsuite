import { Redirect, Route, Switch } from 'react-router-dom';
import { PrintScreen } from './screens/print_screen';
import { ScreenWrapper } from './components/screen_wrapper';
import { pollWorkerRoutes } from './routes';

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
      <Redirect to={pollWorkerRoutes.print.path} />
    </Switch>
  );
}

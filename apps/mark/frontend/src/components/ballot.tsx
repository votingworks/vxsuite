import { useState } from 'react';
import { Route, Switch } from 'react-router-dom';
import { IdleTimerProvider } from 'react-idle-timer';

import { Paths } from '@votingworks/mark-flow-ui';
import { IDLE_TIMEOUT_SECONDS } from '../config/globals';
import { ContestPage } from '../pages/contest_page';
import { DisplaySettingsPage } from '../pages/display_settings_page';
import { IdlePage } from '../pages/idle_page';
import { NotFoundPage } from '../pages/not_found_page';
import { PrintPage } from '../pages/print_page';
import { ReviewPage } from '../pages/review_page';
import { StartScreen } from '../pages/start_screen';

export function Ballot(): JSX.Element {
  const [isIdle, setIsIdle] = useState(false);

  function onActive() {
    // Delay to avoid passing tap to next screen
    window.setTimeout(() => {
      setIsIdle(false);
    }, 200);
  }

  function onIdle() {
    setIsIdle(true);
  }

  return (
    <IdleTimerProvider
      element={document}
      onActive={onActive}
      onIdle={onIdle}
      debounce={250}
      timeout={IDLE_TIMEOUT_SECONDS * 1000}
    >
      {isIdle ? (
        <IdlePage />
      ) : (
        <Switch>
          <Route path="/" exact>
            <StartScreen />
          </Route>
          <Route path={Paths.DISPLAY_SETTINGS} exact>
            <DisplaySettingsPage />
          </Route>
          <Route path="/contests/:contestNumber">
            <ContestPage />
          </Route>
          <Route path="/review">
            <ReviewPage />
          </Route>
          <Route path="/print">
            <PrintPage />
          </Route>
          <Route path="/:path">
            <NotFoundPage />
          </Route>
        </Switch>
      )}
    </IdleTimerProvider>
  );
}

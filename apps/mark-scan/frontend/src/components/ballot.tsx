import { useState } from 'react';
import { Route, Switch } from 'react-router-dom';
import { IdleTimerProvider } from 'react-idle-timer';

import { IDLE_TIMEOUT_SECONDS, Paths } from '../config/globals';
import { ContestPage } from '../pages/contest_page';
import { DisplaySettingsPage } from '../pages/display_settings_page';
import { IdlePage } from '../pages/idle_page';
import { NotFoundPage } from '../pages/not_found_page';
import { PrintPage } from '../pages/print_page';
import { ReviewPage } from '../pages/review_page';
import { StartPage } from '../pages/start_page';
import { ContinueToReviewPage } from '../pages/continue_to_review_page';

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
            <StartPage />
          </Route>
          <Route path={Paths.DISPLAY_SETTINGS} exact>
            <DisplaySettingsPage />
          </Route>
          <Route path="/ready-to-review">
            {/* This page renders a button that lets the voter navigate to /review.
             * During the blank ballot interpretation flow, it's important to render this page
             * before rerendering `<Ballot>`, or Ballot will render PrintPage, the last place we left off */}
            <ContinueToReviewPage />
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

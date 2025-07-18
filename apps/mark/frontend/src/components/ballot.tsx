import { useState } from 'react';
import { Route, Switch } from 'react-router-dom';
import {
  DEFAULT_EVENTS,
  EventsType,
  IdleTimerProvider,
} from 'react-idle-timer';

import { IDLE_TIMEOUT_SECONDS } from '@votingworks/mark-flow-ui';
import { ContestScreen } from '../pages/contest_screen';
import { IdlePage } from '../pages/idle_page';
import { NotFoundPage } from '../pages/not_found_page';
import { PrintPage } from '../pages/print_page';
import { ReviewScreen } from '../pages/review_screen';
import { StartScreen } from '../pages/start_screen';

const USER_ACTIVITY_EVENT_TYPES: EventsType[] = (() => {
  const allEvents = new Set(DEFAULT_EVENTS);
  // The IdlePage has an autofocus button to enable controller interaction,
  // which ends up triggering a focus event that would reset the idle timer.
  // Ignoring focus events here, since we expect that any user-triggered
  // focus event would be preceded by a touch/mouse/keyboard event.
  allEvents.delete('focus');
  return [...allEvents];
})();

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
      events={USER_ACTIVITY_EVENT_TYPES}
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
          <Route path="/contests/:contestNumber">
            <ContestScreen />
          </Route>
          <Route path="/review">
            <ReviewScreen />
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

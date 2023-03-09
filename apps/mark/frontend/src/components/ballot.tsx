import React, { useContext, useState } from 'react';
import { Route, Switch } from 'react-router-dom';
import IdleTimer from 'react-idle-timer';

import { ContestPage } from '../pages/contest_page';
import { IdlePage } from '../pages/idle_page';
import { NotFoundPage } from '../pages/not_found_page';
import { PrintPage } from '../pages/print_page';
import { ReviewPage } from '../pages/review_page';
import { StartPage } from '../pages/start_page';
import { IDLE_TIMEOUT_SECONDS } from '../config/globals';
import { BallotContext } from '../contexts/ballot_context';
import { VoterSettingsModal } from '../pages/user_settings_modal';

export function Ballot(): JSX.Element {
  const [isIdle, setIsIdle] = useState(false);

  // Handle changes to text size user setting
  const {
    userSettings: { showSettingsModal },
  } = useContext(BallotContext);

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
    <IdleTimer
      element={document}
      onActive={onActive}
      onIdle={onIdle}
      debounce={250}
      timeout={IDLE_TIMEOUT_SECONDS * 1000}
    >
      {isIdle ? (
        <IdlePage />
      ) : (
        <React.Fragment>
          <Switch>
            <Route path="/" exact>
              <StartPage />
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
          {showSettingsModal && <VoterSettingsModal />}
        </React.Fragment>
      )}
    </IdleTimer>
  );
}

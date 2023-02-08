import React, { useContext, useEffect, useState } from 'react';
import { Route, Switch } from 'react-router-dom';
import IdleTimer from 'react-idle-timer';

import { ContestPage } from '../pages/contest_page';
import { IdlePage } from '../pages/idle_page';
import { NotFoundPage } from '../pages/not_found_page';
import { PrintPage } from '../pages/print_page';
import { ReviewPage } from '../pages/review_page';
import { SaveCardScreen } from '../pages/save_card_screen';
import { StartPage } from '../pages/start_page';
import { RemoveCardScreen } from '../pages/remove_card_screen';
import {
  IDLE_TIMEOUT_SECONDS,
  FONT_SIZES,
  DEFAULT_FONT_SIZE,
} from '../config/globals';
import { BallotContext } from '../contexts/ballot_context';
import { VoterSettingsModal } from '../pages/user_settings_modal';

export function Ballot(): JSX.Element {
  const [isIdle, setIsIdle] = useState(false);

  // Handle changes to text size user setting
  const {
    userSettings: { textSize, showSettingsModal },
  } = useContext(BallotContext);
  useEffect(() => {
    document.documentElement.style.fontSize = `${FONT_SIZES[textSize]}px`;
    // Trigger application of “See More” buttons based upon scroll-port.
    window.dispatchEvent(new Event('resize'));
    return () => {
      document.documentElement.style.fontSize = `${FONT_SIZES[DEFAULT_FONT_SIZE]}px`;
    };
  }, [textSize]);

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
            <Route path="/save">
              <SaveCardScreen />
            </Route>
            <Route path="/remove">
              <RemoveCardScreen />
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

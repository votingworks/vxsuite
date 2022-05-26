import React, { useCallback, useContext } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, Main, Screen, Prose } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';

export function NotFoundPage(): JSX.Element {
  const { pathname } = useLocation();
  const { resetBallot } = useContext(BallotContext);
  const requestResetBallot = useCallback(() => {
    resetBallot();
  }, [resetBallot]);
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <h1>Page Not Found.</h1>
          <p>
            No page exists at <code>{pathname}</code>.
          </p>
          <p>
            <Button onPress={requestResetBallot}>Start Over</Button>
          </p>
        </Prose>
      </Main>
    </Screen>
  );
}

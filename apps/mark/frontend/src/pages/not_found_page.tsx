import React, { useContext } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, Main, Screen, Prose, H1 } from '@votingworks/ui';
import { BallotContext } from '../contexts/ballot_context';

export function NotFoundPage(): JSX.Element {
  const { pathname } = useLocation();
  const { resetBallot } = useContext(BallotContext);
  function requestResetBallot() {
    resetBallot();
  }
  return (
    <Screen>
      <Main centerChild>
        <Prose textCenter>
          <H1>Page Not Found.</H1>
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

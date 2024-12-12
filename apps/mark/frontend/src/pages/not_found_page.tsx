import { useContext } from 'react';
import { useLocation } from 'react-router-dom';

import { Button, Main, Screen, H1, P } from '@votingworks/ui';
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
        <H1>Page Not Found.</H1>
        <P>
          No page exists at <code>{pathname}</code>.
        </P>
        <P>
          <Button onPress={requestResetBallot}>Start Over</Button>
        </P>
      </Main>
    </Screen>
  );
}

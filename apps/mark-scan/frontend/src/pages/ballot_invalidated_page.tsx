/* istanbul ignore file - placeholder component that will change */
import React, { useContext } from 'react';

import { Screen, H1, Main, Button, Text } from '@votingworks/ui';

import { InsertedSmartCardAuth } from '@votingworks/types';
import { isCardlessVoterAuth } from '@votingworks/utils';
import { confirmInvalidateBallot } from '../api';

import { BallotContext } from '../contexts/ballot_context';
import { ButtonFooter } from '../components/button_footer';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
}

export function BallotInvalidatedPage({
  authStatus,
}: Props): JSX.Element | null {
  const { resetBallot, endVoterSession } = useContext(BallotContext);

  const confirmInvalidateBallotMutation = confirmInvalidateBallot.useMutation();

  async function onPressContinue() {
    // Reset session and ballot before changing the state machine state. If done
    // in the reverse order the screen will flicker
    await endVoterSession();
    resetBallot();
    confirmInvalidateBallotMutation.mutate(undefined);
  }

  let mainContents = (
    <React.Fragment>
      <H1>Remove Ballot</H1>
      <p>
        Remove the ballot and press below to start a new voter session. Remember
        to spoil the old ballot.
      </p>
    </React.Fragment>
  );
  let button = (
    <Button onPress={onPressContinue}>Start a New Voter Session</Button>
  );
  if (isCardlessVoterAuth(authStatus)) {
    mainContents = (
      <React.Fragment>
        <H1>
          <span aria-label="Ask a Poll Worker for Help">
            Ask a Poll Worker for Help
          </span>
        </H1>
        <p>
          You have indicated your ballot needs changes. Please alert a poll
          worker to invalidate your incorrect ballot and restart your voting
          session.
        </p>
      </React.Fragment>
    );
    button = (
      // onPress is a required prop but we want the button to no op
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      <Button disabled onPress={() => {}}>
        Insert a Poll Worker Card to Continue
      </Button>
    );
  }

  return (
    <Screen>
      <Main padded centerChild>
        <Text center>{mainContents}</Text>
      </Main>
      <ButtonFooter>{button}</ButtonFooter>
    </Screen>
  );
}

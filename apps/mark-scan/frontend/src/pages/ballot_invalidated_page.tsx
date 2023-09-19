import { useContext } from 'react';

import { InsertedSmartCardAuth } from '@votingworks/types';

import { confirmInvalidateBallot } from '../api';
import { BallotContext } from '../contexts/ballot_context';
import { AskPollWorkerPage } from './ask_poll_worker_page';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
}

export function BallotInvalidatedPage({ authStatus }: Props): JSX.Element {
  const { resetBallot, endVoterSession } = useContext(BallotContext);

  const confirmInvalidateBallotMutation = confirmInvalidateBallot.useMutation();

  async function onPressContinue() {
    // Reset session and ballot before changing the state machine state. If done
    // in the reverse order the screen will flicker
    await endVoterSession();
    resetBallot();
    confirmInvalidateBallotMutation.mutate(undefined);
  }

  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      cardlessVoterContent={{
        body: (
          <p>
            You have indicated your ballot needs changes. Please alert a poll
            worker to invalidate your incorrect ballot and restart your voting
            session.
          </p>
        ),
      }}
      pollWorkerContent={{
        headerText: 'Remove Ballot',
        body: (
          <p>
            Remove the ballot and press below to start a new voter session.
            Remember to spoil the old ballot.
          </p>
        ),
        buttonText: 'Start a New Voter Session',
        onButtonPress: onPressContinue,
      }}
    />
  );
}

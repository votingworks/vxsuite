/* istanbul ignore file - placeholder component that will change */
import { useContext } from 'react';

import { Screen, H1, Main, Button, CenteredLargeProse } from '@votingworks/ui';

import { confirmInvalidateBallot } from '../api';

import { BallotContext } from '../contexts/ballot_context';
import { ButtonFooter } from '../components/button_footer';

export function BallotInvalidatedPage(): JSX.Element | null {
  const { resetBallot, endVoterSession } = useContext(BallotContext);

  const confirmInvalidateBallotMutation = confirmInvalidateBallot.useMutation();

  function onPressContinue() {
    confirmInvalidateBallotMutation.mutate(undefined, {
      async onSuccess() {
        resetBallot();
        await endVoterSession();
      },
    });
  }

  return (
    <Screen>
      <Main flexColumn>
        <CenteredLargeProse>
          <H1>
            <span aria-label="Ballot Invalidated.">Ballot Invalidated</span>
          </H1>
          <p>
            You have indicated your ballot needs changes. Please alert a poll
            worker to spoil your incorrect ballot and restart your voting
            session.
          </p>
        </CenteredLargeProse>
      </Main>
      <ButtonFooter>
        <Button onPress={onPressContinue}>I Have Alerted a Poll Worker</Button>
      </ButtonFooter>
    </Screen>
  );
}

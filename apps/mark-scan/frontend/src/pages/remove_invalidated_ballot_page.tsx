import { useContext } from 'react';

import { Button, P } from '@votingworks/ui';
import { confirmInvalidateBallot } from '../api';
import { BallotContext } from '../contexts/ballot_context';
import { CenteredPageLayout } from '../components/centered_page_layout';

export function RemoveInvalidatedBallotPage(): JSX.Element {
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
    <CenteredPageLayout
      title="Remove Ballot"
      buttons={
        <Button onPress={onPressContinue}>Start a New Voter Session</Button>
      }
      voterFacing={false}
    >
      <P>
        Remove the ballot and press below to start a new voter session. Remember
        to spoil the old ballot.
      </P>
    </CenteredPageLayout>
  );
}

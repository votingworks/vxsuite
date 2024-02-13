import { Button, P } from '@votingworks/ui';
import { useHistory } from 'react-router-dom';
import { useEffect } from 'react';
import { LogEventId, Logger } from '@votingworks/logging';
import { confirmInvalidateBallot } from '../api';
import { CenteredPageLayout } from '../components/centered_page_layout';

interface Props {
  logger: Logger;
  paperPresent: boolean;
}

export function RemoveInvalidatedBallotPage(props: Props): JSX.Element {
  const { logger, paperPresent } = props;

  const confirmInvalidateBallotMutation = confirmInvalidateBallot.useMutation();

  const history = useHistory();
  useEffect(() => {
    history.push('/ready-to-review');
  });

  async function onPressContinue() {
    await logger.log(
      LogEventId.PollWorkerConfirmedBallotRemoval,
      'poll_worker'
    );
    confirmInvalidateBallotMutation.mutate(undefined);
  }

  return (
    <CenteredPageLayout
      title={paperPresent ? 'Remove Ballot' : 'Ballot Removed'}
      buttons={
        <Button disabled={paperPresent} onPress={onPressContinue}>
          Continue
        </Button>
      }
      voterFacing={false}
    >
      {paperPresent ? (
        <P>Please remove the incorrect ballot.</P>
      ) : (
        <P>
          The incorrect ballot has been removed. Remember to spoil the ballot.
        </P>
      )}
    </CenteredPageLayout>
  );
}

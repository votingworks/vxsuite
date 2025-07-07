import { InsertedSmartCardAuth } from '@votingworks/types';

import { Button, Icons, P, appStrings } from '@votingworks/ui';
import { CenteredCardPageLayout } from '@votingworks/mark-flow-ui';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { confirmBallotBoxEmptied } from '../api';

interface Props {
  authStatus: InsertedSmartCardAuth.AuthStatus;
}

function ConfirmBallotBoxEmptied(): JSX.Element {
  const confirmBallotBoxEmptiedMutation = confirmBallotBoxEmptied.useMutation();

  // No translation - poll worker page
  return (
    <CenteredCardPageLayout
      buttons={
        <Button
          variant="primary"
          onPress={confirmBallotBoxEmptiedMutation.mutate}
        >
          Yes, Ballot Box is Empty
        </Button>
      }
      icon={<Icons.Question />}
      title="Ballot Box Emptied?"
      voterFacing={false}
    >
      <P>Has the full ballot box been emptied?</P>
    </CenteredCardPageLayout>
  );
}

export function EmptyBallotBoxPage({ authStatus }: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      titleOverride={appStrings.titleBallotBoxFull()}
      pollWorkerPage={<ConfirmBallotBoxEmptied />}
    >
      <P>{appStrings.noteBmdBallotBoxIsFull()}</P>
    </AskPollWorkerPage>
  );
}

import { InsertedSmartCardAuth } from '@votingworks/types';

import { P, appStrings } from '@votingworks/ui';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
}

export function BallotInvalidatedPage({ authStatus }: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      pollWorkerPage={<RemoveInvalidatedBallotPage />}
    >
      <P>{appStrings.instructionsBmdInvalidatedBallot()}</P>
    </AskPollWorkerPage>
  );
}

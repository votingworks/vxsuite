import { InsertedSmartCardAuth } from '@votingworks/types';

import { P, appStrings } from '@votingworks/ui';
import { AskPollWorkerPage } from './ask_poll_worker_page.js';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page.js';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
  paperPresent: boolean;
}

export function BallotInvalidatedPage({
  authStatus,
  paperPresent,
}: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      pollWorkerPage={
        <RemoveInvalidatedBallotPage paperPresent={paperPresent} />
      }
    >
      <P>{appStrings.instructionsBmdInvalidatedBallot()}</P>
    </AskPollWorkerPage>
  );
}

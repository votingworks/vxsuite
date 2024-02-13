import { InsertedSmartCardAuth } from '@votingworks/types';

import { P, appStrings } from '@votingworks/ui';
import { Logger } from '@votingworks/logging';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { RemoveInvalidatedBallotPage } from './remove_invalidated_ballot_page';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
  paperPresent: boolean;
  logger: Logger;
}

export function BallotInvalidatedPage({
  authStatus,
  logger,
  paperPresent,
}: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      pollWorkerPage={
        <RemoveInvalidatedBallotPage
          paperPresent={paperPresent}
          logger={logger}
        />
      }
    >
      <P>{appStrings.instructionsBmdInvalidatedBallot()}</P>
    </AskPollWorkerPage>
  );
}

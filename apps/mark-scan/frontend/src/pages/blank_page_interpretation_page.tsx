import { InsertedSmartCardAuth } from '@votingworks/types';

import { AskPollWorkerPage } from './ask_poll_worker_page';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
}

export function BlankPageInterpretationPage({
  authStatus,
}: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      cardlessVoterContent={{
        body: <p>There was a problem interpreting your ballot.</p>,
      }}
      pollWorkerContent={{
        headerText: 'Ballot Sheet Upside Down',
        body: (
          <p>
            The ballot page is blank. It may have been loaded with the print
            side facing down. Please load a ballot sheet with the print side
            facing up.
          </p>
        ),
        buttonText: 'Load Sheet to Continue',
      }}
    />
  );
}

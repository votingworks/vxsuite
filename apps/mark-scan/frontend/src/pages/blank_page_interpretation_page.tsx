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
        headerText: 'Load New Ballot Sheet',
        body: (
          <p>
            The ballot page is blank after printing. It may have been loaded
            with the print side facing down. Please remove the ballot sheet and
            load a new sheet.
          </p>
        ),
        buttonText: 'Load Sheet to Continue',
      }}
    />
  );
}

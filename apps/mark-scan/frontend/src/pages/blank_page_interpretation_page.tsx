import { InsertedSmartCardAuth } from '@votingworks/types';

import { P, appStrings } from '@votingworks/ui';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { ReplaceBlankSheetPage } from './replace_blank_sheet_page';

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
      pollWorkerPage={<ReplaceBlankSheetPage />}
    >
      <P>{appStrings.noteBmdInterpretationProblem()}</P>
    </AskPollWorkerPage>
  );
}

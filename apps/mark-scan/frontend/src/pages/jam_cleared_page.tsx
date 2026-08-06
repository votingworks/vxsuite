import { appStrings, P } from '@votingworks/ui';
import { InsertedSmartCardAuth } from '@votingworks/types';
import { AskPollWorkerPage } from './ask_poll_worker_page.js';
import {
  JamClearedState,
  ReplaceJammedSheetScreen,
} from './replace_jammed_sheet_screen.js';

export interface JamClearedPageProps {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn
    | InsertedSmartCardAuth.LoggedOut;
  stateMachineState: JamClearedState;
}

export function JamClearedPage(props: JamClearedPageProps): JSX.Element {
  const { authStatus, stateMachineState } = props;

  const nonVoterScreen = (
    <ReplaceJammedSheetScreen stateMachineState={stateMachineState} />
  );

  if (authStatus.status === 'logged_out') {
    return nonVoterScreen;
  }

  return (
    <AskPollWorkerPage authStatus={authStatus} pollWorkerPage={nonVoterScreen}>
      <P>{appStrings.noteBmdReloadSheetAfterPaperJam()}</P>
    </AskPollWorkerPage>
  );
}

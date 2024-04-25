import { appStrings, P } from '@votingworks/ui';
import type { SimpleServerStatus } from '@votingworks/mark-scan-backend';
import { InsertedSmartCardAuth } from '@votingworks/types';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { ReplaceJammedSheetScreen } from './replace_jammed_sheet_screen';

const JAM_CLEARED_STATES = [
  'jam_cleared',
  'resetting_state_machine_after_jam',
] as const satisfies readonly SimpleServerStatus[];

export type JamClearedState = (typeof JAM_CLEARED_STATES)[number];

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

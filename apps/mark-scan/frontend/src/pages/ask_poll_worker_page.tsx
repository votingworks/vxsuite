import { appStrings, P } from '@votingworks/ui';

import { InsertedSmartCardAuth } from '@votingworks/types';
import { isPollWorkerAuth } from '@votingworks/utils';

import { CenteredPageLayout } from '../components/centered_page_layout';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
  children: JSX.Element;
  pollWorkerPage: JSX.Element;
}

// Component with 2 stages
// 1. Voter stage: tells the voter to ask a poll worker for help. Does not allow the voter to advance the state.
// 2. Poll worker stage: after auth, gives instructions and a button to advance the state.
export function AskPollWorkerPage(props: Props): JSX.Element {
  const { authStatus, children, pollWorkerPage } = props;

  if (isPollWorkerAuth(authStatus)) {
    return pollWorkerPage;
  }

  return (
    <CenteredPageLayout
      title={appStrings.titleBmdAskForHelpScreen()}
      voterFacing
    >
      <div>{children}</div>
      {/* Poll Worker string - not translated: */}
      <P>Insert a poll worker card to continue.</P>
    </CenteredPageLayout>
  );
}

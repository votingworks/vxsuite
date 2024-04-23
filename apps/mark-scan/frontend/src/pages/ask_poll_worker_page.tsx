import { appStrings, Caption, H6, Icons, P } from '@votingworks/ui';

import { InsertedSmartCardAuth } from '@votingworks/types';
import { isPollWorkerAuth } from '@votingworks/utils';
import React from 'react';
import { CenteredCardPageLayout } from '../components/centered_card_page_layout';

interface Props {
  authStatus: InsertedSmartCardAuth.AuthStatus;
  children: JSX.Element;
  pollWorkerPage: JSX.Element;
  titleOverride?: React.ReactNode;
}

// Component with 2 stages
// 1. Voter stage: tells the voter to ask a poll worker for help. Does not allow the voter to advance the state.
// 2. Poll worker stage: after auth, gives instructions and a button to advance the state.
export function AskPollWorkerPage(props: Props): JSX.Element {
  const { authStatus, children, titleOverride, pollWorkerPage } = props;

  if (isPollWorkerAuth(authStatus)) {
    return pollWorkerPage;
  }

  return (
    <CenteredCardPageLayout
      icon={<Icons.Warning color="warning" />}
      title={titleOverride || appStrings.titleBmdAskForHelpScreen()}
      voterFacing
    >
      {children}

      {/* Poll Worker strings - not translated: */}
      <H6 as="h2">
        <Icons.Info /> Poll Workers:
      </H6>
      <P>
        <Caption>Insert a poll worker card to continue.</Caption>
      </P>
    </CenteredCardPageLayout>
  );
}

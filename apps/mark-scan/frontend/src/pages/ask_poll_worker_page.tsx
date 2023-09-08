import React from 'react';
import { Screen, H1, Main, Button, Text } from '@votingworks/ui';

import { InsertedSmartCardAuth } from '@votingworks/types';
import { isCardlessVoterAuth, isPollWorkerAuth } from '@votingworks/utils';

import { ButtonFooter } from '../components/button_footer';

interface Props {
  authStatus:
    | InsertedSmartCardAuth.CardlessVoterLoggedIn
    | InsertedSmartCardAuth.PollWorkerLoggedIn;
  cardlessVoterContent: {
    body: JSX.Element;
  };
  pollWorkerContent: {
    headerText: string;
    body: JSX.Element;
    buttonText?: string;
    onButtonPress?: () => Promise<void>;
  };
}

// Component with 2 stages
// 1. Voter stage: tells the voter to ask a poll worker for help. Does not allow the voter to advance the state.
// 2. Poll worker stage: after auth, gives instructions and a button to advance the state.
export function AskPollWorkerPage(props: Props): JSX.Element {
  const { authStatus, cardlessVoterContent, pollWorkerContent } = props;

  let mainContents = (
    <React.Fragment>
      <H1>{pollWorkerContent.headerText}</H1>
      {pollWorkerContent.body}
    </React.Fragment>
  );
  const button = isPollWorkerAuth(authStatus) && pollWorkerContent.buttonText &&
    pollWorkerContent.onButtonPress && (
      <Button
        onPress={async (): Promise<void> => {
          if (!pollWorkerContent.onButtonPress) {
            return;
          }
          await pollWorkerContent.onButtonPress();
        }}
      >
        {pollWorkerContent.buttonText}
      </Button>
    );

  if (isCardlessVoterAuth(authStatus)) {
    mainContents = (
      <React.Fragment>
        <H1>
          <span aria-label="Ask a Poll Worker for Help">
            Ask a Poll Worker for Help
          </span>
        </H1>
        {cardlessVoterContent.body}
        <p>Insert a poll worker card to continue.</p>
      </React.Fragment>
    );
  }

  return (
    <Screen>
      <Main padded centerChild>
        <Text center>{mainContents}</Text>
      </Main>
      {button && <ButtonFooter>{button}</ButtonFooter>}
    </Screen>
  );
}

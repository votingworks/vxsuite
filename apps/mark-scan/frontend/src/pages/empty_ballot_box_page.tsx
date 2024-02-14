import { InsertedSmartCardAuth } from '@votingworks/types';

import {
  Button,
  Font,
  FullScreenIconWrapper,
  H1,
  Icons,
  P,
  appStrings,
} from '@votingworks/ui';
import React from 'react';
import styled from 'styled-components';
import { AskPollWorkerPage } from './ask_poll_worker_page';
import { confirmBallotBoxEmptied } from '../api';
import { CenteredPageLayout } from '../components/centered_page_layout';

interface Props {
  authStatus: InsertedSmartCardAuth.AuthStatus;
}

const ConfirmButtonWrapper = styled.div`
  padding-top: 1em;
`;

function ConfirmBallotBoxEmptied(): JSX.Element {
  const confirmBallotBoxEmptiedMutation = confirmBallotBoxEmptied.useMutation();

  // No translation - poll worker page
  return (
    <CenteredPageLayout voterFacing={false} textAlign="left">
      <H1>Ballot Box Emptied?</H1>
      <P>Has the full ballot box been emptied?</P>
      <ConfirmButtonWrapper>
        <Button
          variant="primary"
          onPress={() => {
            confirmBallotBoxEmptiedMutation.mutate();
          }}
        >
          Yes, Ballot Box is Empty
        </Button>
      </ConfirmButtonWrapper>
    </CenteredPageLayout>
  );
}

export function EmptyBallotBoxPage({ authStatus }: Props): JSX.Element {
  return (
    <AskPollWorkerPage
      authStatus={authStatus}
      hideTitle
      pollWorkerPage={<ConfirmBallotBoxEmptied />}
    >
      <React.Fragment>
        <Font align="center">
          <FullScreenIconWrapper>
            <Icons.Warning color="warning" />
          </FullScreenIconWrapper>
        </Font>
        <H1>{appStrings.titleBallotBoxFull()}</H1>
        <P>{appStrings.noteBmdBallotBoxIsFull()}</P>
      </React.Fragment>
    </AskPollWorkerPage>
  );
}

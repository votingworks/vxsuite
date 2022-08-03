import React from 'react';
import styled from 'styled-components';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';

interface HeadingProps {
  marginTop: string;
}

const Heading = styled.h1<HeadingProps>`
  /* stylelint-disable-next-line declaration-no-important */
  margin-top: ${(props) => props.marginTop} !important;
`;

interface Props {
  actionStatus?: SmartcardActionStatus;
  card: CardProgramming;
  setActionStatus: (status?: SmartcardActionStatus) => void;
}

export function ProgramSuperAdminCardView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
  const showingSuccessOrErrorMessage =
    actionStatus?.status === 'Success' || actionStatus?.status === 'Error';

  async function programSuperAdminCard() {
    setActionStatus({
      action: 'Program',
      role: 'superadmin',
      status: 'InProgress',
    });
    const result = await card.programUser({
      role: 'superadmin',
      passcode: generatePin(),
    });
    setActionStatus({
      action: 'Program',
      role: 'superadmin',
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  return (
    <Prose textCenter theme={fontSizeTheme.medium}>
      {actionStatus && (
        <p>
          <StatusMessage actionStatus={actionStatus} />
        </p>
      )}
      <Heading marginTop={showingSuccessOrErrorMessage ? '1em' : '0'}>
        Create New Super Admin Card
      </Heading>
      <p>
        This card performs all system actions. Strictly limit the number created
        and keep all Super Admin cards secure.
      </p>

      <HorizontalRule />
      <p>
        <Button onPress={programSuperAdminCard}>Create Super Admin Card</Button>
      </p>
      <HorizontalRule />

      <p>Remove card to cancel.</p>
    </Prose>
  );
}

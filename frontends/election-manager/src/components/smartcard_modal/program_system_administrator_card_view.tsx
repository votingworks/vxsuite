import React from 'react';
import styled from 'styled-components';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';
import { generatePin } from '@votingworks/utils';

import {
  isSmartcardActionComplete,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';

const StatusMessageContainer = styled.div`
  margin-bottom: 2.5em;
`;

interface Props {
  actionStatus?: SmartcardActionStatus;
  card: CardProgramming;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function ProgramSystemAdministratorCardView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
  async function programSystemAdministratorCard() {
    setActionStatus({
      action: 'Program',
      role: 'system_administrator',
      status: 'InProgress',
    });
    const result = await card.programUser({
      role: 'system_administrator',
      passcode: generatePin(),
    });
    setActionStatus({
      action: 'Program',
      role: 'system_administrator',
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  return (
    <React.Fragment>
      {isSmartcardActionComplete(actionStatus) && (
        <StatusMessageContainer>
          <Prose textCenter theme={fontSizeTheme.medium}>
            <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
          </Prose>
        </StatusMessageContainer>
      )}

      <Prose textCenter theme={fontSizeTheme.medium}>
        <h1>Create New System Administrator Card</h1>
        <p>
          This card performs all system actions. Strictly limit the number
          created and keep all System Administrator cards secure.
        </p>

        <HorizontalRule />
        <p>
          <Button onPress={programSystemAdministratorCard}>
            Create System Administrator Card
          </Button>
        </p>
        <HorizontalRule />

        <p>Remove card to cancel.</p>
      </Prose>
    </React.Fragment>
  );
}

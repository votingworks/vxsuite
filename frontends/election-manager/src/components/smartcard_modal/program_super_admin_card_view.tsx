import React from 'react';
import styled from 'styled-components';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { generatePin } from './pins';
import {
  isSmartcardActionComplete,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';

const StatusMessageProse = styled(Prose)`
  margin-bottom: 1.5em;
`;

interface Props {
  actionStatus?: SmartcardActionStatus;
  card: CardProgramming;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function ProgramSuperAdminCardView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
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
    <React.Fragment>
      {isSmartcardActionComplete(actionStatus) && (
        <StatusMessageProse textCenter theme={fontSizeTheme.medium}>
          <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
        </StatusMessageProse>
      )}

      <Prose textCenter theme={fontSizeTheme.medium}>
        <h1>Create New Super Admin Card</h1>
        <p>
          This card performs all system actions. Strictly limit the number
          created and keep all Super Admin Cards secure.
        </p>

        <HorizontalRule />
        <p>
          <Button onPress={programSuperAdminCard}>
            Create Super Admin Card
          </Button>
        </p>
        <HorizontalRule />

        <p>Remove card to cancel.</p>
      </Prose>
    </React.Fragment>
  );
}

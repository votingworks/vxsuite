import React from 'react';
import styled from 'styled-components';
import {
  Button,
  fontSizeTheme,
  HorizontalRule,
  Prose,
} from '@votingworks/shared-frontend';

import {
  isSmartcardActionComplete,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';
import { programCard } from '../../api';

const StatusMessageContainer = styled.div`
  margin-bottom: 2.5em;
`;

interface Props {
  actionStatus?: SmartcardActionStatus;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function ProgramSystemAdministratorCardView({
  actionStatus,
  setActionStatus,
}: Props): JSX.Element {
  const programCardMutation = programCard.useMutation();

  function programSystemAdministratorCard() {
    setActionStatus({
      action: 'Program',
      role: 'system_administrator',
      status: 'InProgress',
    });
    programCardMutation.mutate(
      { userRole: 'system_administrator' },
      {
        onSuccess: (result) => {
          setActionStatus({
            action: 'Program',
            role: 'system_administrator',
            status: result.isOk() ? 'Success' : 'Error',
          });
        },
      }
    );
  }

  return (
    <React.Fragment>
      {isSmartcardActionComplete(actionStatus) && (
        <StatusMessageContainer>
          <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
            <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
          </Prose>
        </StatusMessageContainer>
      )}

      <Prose textCenter themeDeprecated={fontSizeTheme.medium}>
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

import React from 'react';
import styled from 'styled-components';
import { Button, Font, fontSizeTheme, H1, P, Prose } from '@votingworks/ui';

import { programCard } from '../../api';
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
            newPin: result.ok()?.pin,
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

      <Font align="center">
        <H1>Create New System Administrator Card</H1>
        <P>
          This card performs all system actions.
          <br />
          Strictly limit the number created and keep all System Administrator
          cards secure.
        </P>

        <P>
          <Button onPress={programSystemAdministratorCard}>
            Create System Administrator Card
          </Button>
        </P>

        <P>Remove card to cancel.</P>
      </Font>
    </React.Fragment>
  );
}

import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/basics';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';

import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
import {
  isSmartcardActionComplete,
  SmartcardActionStatus,
  SuccessOrErrorStatusMessage,
} from './status_message';
import { useApiClient } from '../../api';

const StatusMessageContainer = styled.div`
  margin-bottom: 2.5em;
`;

interface Props {
  actionStatus?: SmartcardActionStatus;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function ProgramElectionCardView({
  actionStatus,
  setActionStatus,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const apiClient = useApiClient();

  async function programAdminCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'election_manager',
      status: 'InProgress',
    });
    const result = await apiClient.programCard({
      userRole: 'election_manager',
    });
    setActionStatus({
      action: 'Program',
      role: 'election_manager',
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  async function programPollWorkerCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'poll_worker',
      status: 'InProgress',
    });
    const result = await apiClient.programCard({
      userRole: 'poll_worker',
    });
    setActionStatus({
      action: 'Program',
      role: 'poll_worker',
      status: result.isOk() ? 'Success' : 'Error',
    });
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
        <h1>Create New Election Card</h1>
        {electionDefinition ? (
          <React.Fragment>
            <p>{electionToDisplayString(electionDefinition.election)}</p>

            <HorizontalRule />
            <p>
              <Button disabled={!electionDefinition} onPress={programAdminCard}>
                Election Manager Card
              </Button>{' '}
              or{' '}
              <Button
                disabled={!electionDefinition}
                onPress={programPollWorkerCard}
              >
                Poll Worker Card
              </Button>
            </p>
            <HorizontalRule />

            <p>Remove card to cancel.</p>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <HorizontalRule />
            <p>An election must be defined before cards can be created.</p>
            <HorizontalRule />

            <p>Remove card to leave this screen.</p>
          </React.Fragment>
        )}
      </Prose>
    </React.Fragment>
  );
}

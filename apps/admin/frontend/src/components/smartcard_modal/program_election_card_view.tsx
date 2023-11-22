import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/basics';
import { Button, Font, H1, P } from '@votingworks/ui';

import { programCard } from '../../api';
import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
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

export function ProgramElectionCardView({
  actionStatus,
  setActionStatus,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);
  const programCardMutation = programCard.useMutation();

  function programElectionManagerCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'election_manager',
      status: 'InProgress',
    });
    programCardMutation.mutate(
      { userRole: 'election_manager' },
      {
        onSuccess: (result) => {
          setActionStatus({
            action: 'Program',
            newPin: result.ok()?.pin,
            role: 'election_manager',
            status: result.isOk() ? 'Success' : 'Error',
          });
        },
      }
    );
  }

  function programPollWorkerCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'poll_worker',
      status: 'InProgress',
    });
    programCardMutation.mutate(
      { userRole: 'poll_worker' },
      {
        onSuccess: (result) => {
          setActionStatus({
            action: 'Program',
            newPin: result.ok()?.pin,
            role: 'poll_worker',
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
          <Font align="center">
            <SuccessOrErrorStatusMessage actionStatus={actionStatus} />
          </Font>
        </StatusMessageContainer>
      )}

      <Font align="center">
        <H1>Create New Election Card</H1>
        {electionDefinition ? (
          <React.Fragment>
            <P>{electionToDisplayString(electionDefinition.election)}</P>

            <P>
              <Button
                disabled={!electionDefinition}
                onPress={programElectionManagerCard}
              >
                Election Manager Card
              </Button>{' '}
              <Button
                disabled={!electionDefinition}
                onPress={programPollWorkerCard}
              >
                Poll Worker Card
              </Button>
            </P>

            <P>Remove card to cancel.</P>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <P>An election must be defined before cards can be created.</P>
            <P>Remove card to leave this screen.</P>
          </React.Fragment>
        )}
      </Font>
    </React.Fragment>
  );
}

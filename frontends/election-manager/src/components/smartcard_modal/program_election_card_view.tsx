import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert, generatePin } from '@votingworks/utils';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

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
  card: CardProgramming;
  setActionStatus: (actionStatus?: SmartcardActionStatus) => void;
}

export function ProgramElectionCardView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);

  async function programAdminCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'election_manager',
      status: 'InProgress',
    });
    const result = await card.programUser({
      role: 'election_manager',
      electionData: electionDefinition.electionData,
      electionHash: electionDefinition.electionHash,
      passcode: generatePin(),
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
    const result = await card.programUser({
      role: 'poll_worker',
      electionHash: electionDefinition.electionHash,
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

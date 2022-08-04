import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
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
      role: 'admin',
      status: 'InProgress',
    });
    const result = await card.programUser({
      role: 'admin',
      electionData: electionDefinition.electionData,
      electionHash: electionDefinition.electionHash,
      passcode: generatePin(),
    });
    setActionStatus({
      action: 'Program',
      role: 'admin',
      status: result.isOk() ? 'Success' : 'Error',
    });
  }

  async function programPollWorkerCard() {
    assert(electionDefinition);

    setActionStatus({
      action: 'Program',
      role: 'pollworker',
      status: 'InProgress',
    });
    const result = await card.programUser({
      role: 'pollworker',
      electionHash: electionDefinition.electionHash,
    });
    setActionStatus({
      action: 'Program',
      role: 'pollworker',
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
        <h1>Create New Election Card</h1>
        {electionDefinition && (
          <p>{electionToDisplayString(electionDefinition.election)}</p>
        )}

        <HorizontalRule />
        {electionDefinition ? (
          <p>
            <Button disabled={!electionDefinition} onPress={programAdminCard}>
              Admin Card
            </Button>{' '}
            or{' '}
            <Button
              disabled={!electionDefinition}
              onPress={programPollWorkerCard}
            >
              Poll Worker Card
            </Button>
          </p>
        ) : (
          <p>
            An election must be defined before Admin and Poll Worker cards can
            be programmed.
          </p>
        )}
        <HorizontalRule />

        <p>Remove card to cancel.</p>
      </Prose>
    </React.Fragment>
  );
}

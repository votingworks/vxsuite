import React, { useContext } from 'react';
import styled from 'styled-components';
import { assert } from '@votingworks/utils';
import { Button, fontSizeTheme, HorizontalRule, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { electionToDisplayString } from './elections';
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

export function ProgramElectionCardView({
  actionStatus,
  card,
  setActionStatus,
}: Props): JSX.Element {
  const { electionDefinition } = useContext(AppContext);

  const showingSuccessOrErrorMessage =
    actionStatus?.status === 'Success' || actionStatus?.status === 'Error';

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
    <Prose textCenter theme={fontSizeTheme.medium}>
      {actionStatus && (
        <p>
          <StatusMessage actionStatus={actionStatus} />
        </p>
      )}
      <Heading marginTop={showingSuccessOrErrorMessage ? '1em' : '0'}>
        Create New Election Card
      </Heading>
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
          An election must be defined before Admin and Poll Worker cards can be
          programmed.
        </p>
      )}
      <HorizontalRule />

      <p>Remove card to cancel.</p>
    </Prose>
  );
}

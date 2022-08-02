import React, { useContext } from 'react';
import { assert, format } from '@votingworks/utils';
import {
  Button,
  Prose,
  HorizontalRule,
  Text,
  fontSizeTheme,
} from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { AppContext } from '../../contexts/app_context';
import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';

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

  const election = electionDefinition?.election;

  return (
    <Prose textCenter theme={fontSizeTheme.large}>
      {actionStatus && (
        <Text style={{ marginBottom: '-1.5em' }}>
          <StatusMessage actionStatus={actionStatus} />
        </Text>
      )}
      <h1>Create New Election Card</h1>
      {election && (
        <p>
          {election.title} —{' '}
          {format.localeWeekdayAndDate(new Date(election.date))}
        </p>
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

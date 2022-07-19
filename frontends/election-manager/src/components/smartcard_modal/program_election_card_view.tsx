import React, { useContext } from 'react';
import { Button, Prose } from '@votingworks/ui';
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
    if (!electionDefinition) {
      return;
    }
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
    if (!electionDefinition) {
      return;
    }
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
    <Prose textCenter>
      <h2>Program Election Card</h2>
      {/* An empty div to maintain space between the header and subsequent p. TODO: Consider adding
        a `maintainSpaceBelowHeaders` prop to `Prose` */}
      <div />
      {actionStatus && <StatusMessage actionStatus={actionStatus} />}
      {electionDefinition ? (
        <p>Admin and Poll Worker cards only work for the current election.</p>
      ) : (
        <p>
          An election must be defined before Admin and Poll Worker cards can be
          programmed.
        </p>
      )}
      <p>Remove card to leave card unprogrammed.</p>
      <p>
        <Button disabled={!electionDefinition} onPress={programAdminCard}>
          Program Admin Card
        </Button>
      </p>
      <p>
        <Button disabled={!electionDefinition} onPress={programPollWorkerCard}>
          Program Poll Worker Card
        </Button>
      </p>
    </Prose>
  );
}

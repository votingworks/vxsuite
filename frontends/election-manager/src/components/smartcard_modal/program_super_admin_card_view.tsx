import React from 'react';
import { Button, Prose } from '@votingworks/ui';
import { CardProgramming } from '@votingworks/types';

import { generatePin } from './pins';
import { SmartcardActionStatus, StatusMessage } from './status_message';

interface Props {
  actionStatus?: SmartcardActionStatus;
  card: CardProgramming;
  setActionStatus: (status?: SmartcardActionStatus) => void;
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
    <Prose textCenter>
      <h2>Program Super Admin Card</h2>
      {/* An empty div to maintain space between the header and subsequent p. TODO: Consider adding
        a `maintainSpaceBelowHeaders` prop to `Prose` */}
      <div />
      {actionStatus && <StatusMessage actionStatus={actionStatus} />}
      <p>
        This card performs all system actions. Strictly limit the number created
        and keep all Super Admin cards secure.
      </p>
      <p>Remove card to leave card unprogrammed.</p>
      <p>
        <Button onPress={programSuperAdminCard}>
          Program Super Admin Card
        </Button>
      </p>
    </Prose>
  );
}

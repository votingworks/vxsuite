import React from 'react';
import { Button, Loading, Modal, Prose } from '@votingworks/ui';
import { CardProgramming, UserRole } from '@votingworks/types';

import { SmartcardActionStatus } from './status_message';
import { userRoleToReadableString } from './user_roles';

interface Props {
  actionStatus?: SmartcardActionStatus;
  card: CardProgramming;
  closeModal: () => void;
  programmedUserRole: UserRole;
  setActionStatus: (status?: SmartcardActionStatus) => void;
}

export function UnprogramCardConfirmationModal({
  actionStatus,
  card,
  closeModal,
  programmedUserRole,
  setActionStatus,
}: Props): JSX.Element {
  async function unprogramCard() {
    setActionStatus({
      action: 'Unprogram',
      role: programmedUserRole,
      status: 'InProgress',
    });
    const result = await card.unprogramUser();
    setActionStatus({
      action: 'Unprogram',
      role: programmedUserRole,
      status: result.isOk() ? 'Success' : 'Error',
    });
    closeModal();
  }

  if (
    actionStatus?.action === 'Unprogram' &&
    actionStatus?.status === 'InProgress'
  ) {
    return (
      <Modal content={<Loading as="p">Deleting all data on card</Loading>} />
    );
  }

  return (
    <Modal
      content={
        <Prose textCenter>
          <h2>Unprogram Card</h2>
          <p>
            Are you sure you want to unprogram this{' '}
            {userRoleToReadableString(programmedUserRole)} card and delete all
            data on it?
          </p>
        </Prose>
      }
      actions={
        <React.Fragment>
          <Button onPress={closeModal}>Cancel</Button>
          <Button onPress={unprogramCard} danger>
            Yes
          </Button>
        </React.Fragment>
      }
    />
  );
}

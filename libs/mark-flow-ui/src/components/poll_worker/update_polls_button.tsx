/* istanbul ignore file - @preserve - currently tested via apps. */

import { throwIllegalValue } from '@votingworks/basics';
import { type PollsState, type PollsTransitionType } from '@votingworks/types';
import { Button, Modal, P } from '@votingworks/ui';
import {
  getPollsTransitionAction,
  getPollsTransitionDestinationState,
} from '@votingworks/utils';
import React, { useState } from 'react';

export interface UpdatePollsButtonProps {
  pollsTransition: PollsTransitionType;
  updatePollsState: (pollsState: PollsState) => void;
  isPrimaryButton: boolean;
}

export function UpdatePollsButton(props: UpdatePollsButtonProps): JSX.Element {
  const { pollsTransition, updatePollsState, isPrimaryButton } = props;
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);

  function closeModal() {
    setIsConfirmationModalOpen(false);
  }

  function confirmUpdate() {
    updatePollsState(getPollsTransitionDestinationState(pollsTransition));
    closeModal();
  }

  const action = getPollsTransitionAction(pollsTransition);
  const explanationText = (() => {
    switch (pollsTransition) {
      case 'open_polls':
        return `After polls are opened, voters will be able to mark and cast ballots.`;
      case 'pause_voting':
        return `After voting is paused, voters will not be able to mark and cast ballots until voting is resumed.`;
      case 'resume_voting':
        return `After voting is resumed, voters will be able to mark and cast ballots.`;
      case 'close_polls':
        return `After polls are closed, voters will no longer be able to mark and cast ballots. Polls cannot be opened again.`;
      default: {
        /* istanbul ignore next - @preserve */
        throwIllegalValue(pollsTransition);
      }
    }
  })();

  return (
    <React.Fragment>
      <Button
        variant={isPrimaryButton ? 'primary' : 'neutral'}
        onPress={() => setIsConfirmationModalOpen(true)}
      >
        {action}
      </Button>
      {isConfirmationModalOpen && (
        <Modal
          title={`${action}`}
          content={<P>{explanationText}</P>}
          actions={
            <React.Fragment>
              <Button variant="primary" onPress={confirmUpdate}>
                {action}
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}

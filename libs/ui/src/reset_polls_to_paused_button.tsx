import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/utils';
import React, { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';
import { Prose } from './prose';

interface Props {
  resetPollsToPausedText: string;
  resetPollsToPaused?: () => Promise<void>;
  logger: Logger;
}

export function ResetPollsToPausedButton({
  resetPollsToPausedText,
  resetPollsToPaused,
  logger,
}: Props): JSX.Element {
  const [isShowingConfirmModal, setIsShowingConfirmModal] = useState(false);

  function showModal() {
    setIsShowingConfirmModal(true);
  }

  function hideModal() {
    setIsShowingConfirmModal(false);
  }

  async function doReset() {
    assert(resetPollsToPaused);
    await resetPollsToPaused();
    await logger.log(LogEventId.ResetPollsToPaused, 'system_administrator', {
      message: 'Polls were reset from closed to paused.',
      disposition: 'success',
    });
    hideModal();
  }

  return (
    <React.Fragment>
      <Button onPress={showModal} disabled={!resetPollsToPaused}>
        Reset Polls to Paused
      </Button>
      {isShowingConfirmModal && (
        <Modal
          content={
            <Prose>
              <h1>Reset Polls to Paused</h1>
              <p>{resetPollsToPausedText}</p>
            </Prose>
          }
          onOverlayClick={hideModal}
          actions={
            <React.Fragment>
              <Button danger onPress={doReset}>
                Reset Polls to Paused
              </Button>
              <Button onPress={hideModal}>Close</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

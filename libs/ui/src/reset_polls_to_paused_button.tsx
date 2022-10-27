import { LogEventId, Logger } from '@votingworks/logging';
import { assert } from '@votingworks/utils';
import React, { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';
import { Prose } from './prose';

interface Props {
  resetPollsToPaused?: () => Promise<void>;
  logger: Logger;
}

export function ResetPollsToPausedButton({
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
              <p>
                The polls are closed and voting is complete. After resetting the
                polls to paused, it will be possible to re-open the polls and
                resume voting. All current cast vote records will be preserved.
              </p>
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

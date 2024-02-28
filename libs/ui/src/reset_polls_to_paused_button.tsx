import { LogEventId, BaseLogger } from '@votingworks/logging';
import { assert } from '@votingworks/basics';
import React, { useState } from 'react';
import { Button } from './button';
import { Modal } from './modal';
import { Prose } from './prose';
import { H1, P } from './typography';

interface Props {
  resetPollsToPausedText: string;
  resetPollsToPaused?: () => Promise<void>;
  logger: BaseLogger;
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
              <H1>Reset Polls to Paused</H1>
              <P>{resetPollsToPausedText}</P>
            </Prose>
          }
          onOverlayClick={hideModal}
          actions={
            <React.Fragment>
              <Button variant="danger" onPress={doReset}>
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

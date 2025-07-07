/* istanbul ignore file - @preserve - currently tested via apps. */

import { DateWithoutTime } from '@votingworks/basics';
import { Election } from '@votingworks/types';
import { Modal, P, Font, Caption, Button } from '@votingworks/ui';
import React from 'react';

export interface EnableLiveModeModalProps {
  election: Election;
  liveMode: boolean;
  setTestMode: (params: { isTestMode: boolean }) => void;
}

export function EnableLiveModeModal(
  props: EnableLiveModeModalProps
): React.ReactNode {
  const { election, liveMode, setTestMode } = props;
  const isElectionDay = election.date.isEqual(DateWithoutTime.today());

  const [modalActive, setModalActive] = React.useState(
    !liveMode && isElectionDay
  );

  if (!modalActive) return null;

  function onConfirm() {
    setTestMode({ isTestMode: false });
    setModalActive(false);
  }

  return (
    <Modal
      centerContent
      title="Switch to Official Ballot Mode and reset the Ballots Printed count?"
      content={
        <div>
          <P>
            Today is election day and this machine is in{' '}
            <Font noWrap weight="bold">
              Test Ballot Mode.
            </Font>
          </P>
          <Caption>
            Note: Switching back to Test Ballot Mode requires an{' '}
            <Font noWrap>election manager card.</Font>
          </Caption>
        </div>
      }
      actions={
        <React.Fragment>
          <Button variant="danger" icon="Danger" onPress={onConfirm}>
            Switch to Official Ballot Mode
          </Button>
          <Button onPress={setModalActive} value={false}>
            Cancel
          </Button>
        </React.Fragment>
      }
    />
  );
}
